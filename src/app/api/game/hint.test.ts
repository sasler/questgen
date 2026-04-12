import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockGenerateHint, mockGetMetadata, mockGetSettings } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockGenerateHint: vi.fn(),
    mockGetMetadata: vi.fn(),
    mockGetSettings: vi.fn(),
  }));

const mockGetStorage = vi.fn(() => ({
  getMetadata: mockGetMetadata,
  getSettings: mockGetSettings,
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/hint-generator", () => ({
  generateHint: mockGenerateHint,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => mockGetStorage(),
  formatStorageError: (error: unknown) =>
    `Storage failed: ${error instanceof Error ? error.message : String(error)}`,
}));

import { POST } from "@/app/api/game/[id]/hint/route";

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/game/game-1/hint", {
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

describe("POST /api/game/[id]/hint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorage.mockImplementation(() => ({
      getMetadata: mockGetMetadata,
      getSettings: mockGetSettings,
    }));
    mockAuth.mockResolvedValue(mockSession);
    mockGetMetadata.mockResolvedValue(mockMetadata);
    mockGetSettings.mockResolvedValue(mockSettings);
    mockGenerateHint.mockResolvedValue(
      "Take the toolkit to the relay room before you attempt the final door.",
    );
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

  it("returns the generated hint on success", async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      hint: "Take the toolkit to the relay room before you attempt the final door.",
    });
  });
});
