import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockAuth,
  mockGenerateOpeningNarration,
  mockGetMetadata,
  mockGetSettings,
  mockGetHistory,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGenerateOpeningNarration: vi.fn(),
  mockGetMetadata: vi.fn(),
  mockGetSettings: vi.fn(),
  mockGetHistory: vi.fn(),
}));

const mockGetStorage = vi.fn(() => ({
  getMetadata: mockGetMetadata,
  getSettings: mockGetSettings,
  getHistory: mockGetHistory,
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/opening-narration", () => ({
  generateOpeningNarration: mockGenerateOpeningNarration,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => mockGetStorage(),
  formatStorageError: (error: unknown) =>
    `Storage failed: ${error instanceof Error ? error.message : String(error)}`,
}));

import { POST } from "@/app/api/game/[id]/intro/route";

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/game/game-1/intro", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id = "game-1") {
  return { params: Promise.resolve({ id }) };
}

const mockSession = {
  user: { id: "user-123", name: "Test", email: "test@test.com" },
  accessToken: "gh-token-abc",
};

const mockMetadata = {
  id: "game-1",
  userId: "user-123",
  title: "Test Game",
  description: "A test game",
  size: "small",
  createdAt: Date.now(),
  lastPlayedAt: Date.now(),
  turnCount: 0,
  completed: false,
};

const mockSettings = {
  generationModel: "gpt-4o",
  gameplayModel: "gpt-4o-mini",
  responseLength: "moderate" as const,
  provider: "copilot" as const,
};

describe("POST /api/game/[id]/intro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorage.mockImplementation(() => ({
      getMetadata: mockGetMetadata,
      getSettings: mockGetSettings,
      getHistory: mockGetHistory,
    }));
    mockAuth.mockResolvedValue(mockSession);
    mockGetMetadata.mockResolvedValue(mockMetadata);
    mockGetSettings.mockResolvedValue(mockSettings);
    mockGetHistory.mockResolvedValue([]);
    mockGenerateOpeningNarration.mockResolvedValue({
      turnId: "intro-1",
      role: "narrator",
      text: "You wake up somewhere the architect clearly regretted.",
      timestamp: 123,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when game not found", async () => {
    mockGetMetadata.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("streams opening narration entry on success", async () => {
    mockGenerateOpeningNarration.mockImplementation(
      async (
        _gameId: string,
        _aiConfig: unknown,
        _settings: unknown,
        _storage: unknown,
        _provider: unknown,
        onChunk?: (chunk: string) => void,
      ) => {
        onChunk?.("You wake up ");
        onChunk?.("somewhere unpleasant.");
        return {
          turnId: "intro-1",
          role: "narrator",
          text: "You wake up somewhere unpleasant.",
          timestamp: 123,
        };
      },
    );

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");

    const body = await res.text();
    const lines = body.trim().split("\n");
    expect(JSON.parse(lines[0])).toEqual({ type: "chunk", chunk: "You wake up " });
    expect(JSON.parse(lines[1])).toEqual({
      type: "chunk",
      chunk: "somewhere unpleasant.",
    });
    expect(JSON.parse(lines[2])).toEqual({
      type: "final",
      entry: {
        turnId: "intro-1",
        role: "narrator",
        text: "You wake up somewhere unpleasant.",
        timestamp: 123,
      },
    });
  });
});
