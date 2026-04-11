import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ──────────────────────────────────────────────────

const { mockAuth, mockProcessTurn, mockGetMetadata, mockGetSettings } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockProcessTurn: vi.fn(),
    mockGetMetadata: vi.fn(),
    mockGetSettings: vi.fn(),
  }));
const mockGetStorage = vi.fn(() => ({
  getMetadata: mockGetMetadata,
  getSettings: mockGetSettings,
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/turn-processor", () => ({ processTurn: mockProcessTurn }));
vi.mock("@/lib/storage", () => ({
  getStorage: () => mockGetStorage(),
  formatStorageError: (error: unknown) =>
    `Storage failed: ${error instanceof Error ? error.message : String(error)}`,
}));

import { POST } from "@/app/api/game/[id]/turn/route";

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/game/game-1/turn", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id = "game-1") {
  return { params: Promise.resolve({ id }) };
}

// ── Fixtures ────────────────────────────────────────────────────────

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

const mockTurnResult = {
  success: true,
  narrative: "You walk north into a dark cave.",
  actionResults: [{ type: "move", success: true }],
  newPlayerState: {
    currentRoomId: "cave",
    inventory: [],
    visitedRooms: ["start", "cave"],
    flags: {},
    turnCount: 1,
    stateVersion: 1,
  },
  worldChanged: false,
  gameWon: false,
};

// ── Tests ───────────────────────────────────────────────────────────

describe("POST /api/game/[id]/turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorage.mockImplementation(() => ({
      getMetadata: mockGetMetadata,
      getSettings: mockGetSettings,
    }));
    mockAuth.mockResolvedValue(mockSession);
    mockGetMetadata.mockResolvedValue(mockMetadata);
    mockGetSettings.mockResolvedValue(mockSettings);
    mockProcessTurn.mockResolvedValue(mockTurnResult);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when input missing", async () => {
    const res = await POST(makeRequest({ turnId: "t1" }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/input/i);
  });

  it("returns 400 when turnId missing", async () => {
    const res = await POST(
      makeRequest({ input: "go north" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/turnId/i);
  });

  it("returns 404 when game not found", async () => {
    mockGetMetadata.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when game doesn't belong to user", async () => {
    mockGetMetadata.mockResolvedValue({
      ...mockMetadata,
      userId: "other-user",
    });
    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with TurnResult on success", async () => {
    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual(mockTurnResult);
  });

  it("streams narrative chunks before the final turn result", async () => {
    mockProcessTurn.mockImplementation(
      async (
        _gameId: string,
        _input: string,
        _turnId: string,
        _aiConfig: unknown,
        _settings: unknown,
        _storage: unknown,
        _provider: unknown,
        onNarrativeChunk?: (chunk: string) => void,
      ) => {
        onNarrativeChunk?.("You walk ");
        onNarrativeChunk?.("north ");
        onNarrativeChunk?.("into a dark cave.");
        return mockTurnResult;
      },
    );

    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1", stream: true }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");

    const body = await res.text();
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0])).toEqual({ type: "chunk", chunk: "You walk " });
    expect(JSON.parse(lines[1])).toEqual({ type: "chunk", chunk: "north " });
    expect(JSON.parse(lines[2])).toEqual({
      type: "chunk",
      chunk: "into a dark cave.",
    });
    expect(JSON.parse(lines[3])).toEqual({
      type: "final",
      result: mockTurnResult,
    });
  });

  it("accepts email-backed ownership when session user.id is missing", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "test@test.com", name: "Test" },
      accessToken: "gh-token-abc",
    });
    mockGetMetadata.mockResolvedValue({
      ...mockMetadata,
      userId: "test@test.com",
    });

    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(mockProcessTurn).toHaveBeenCalledWith(
      "game-1",
      "go north",
      "t1",
      { mode: "copilot", githubToken: "gh-token-abc" },
      mockSettings,
      expect.anything(),
    );
  });

  it("passes correct aiConfig for copilot mode", async () => {
    await POST(
      makeRequest({ input: "go north", turnId: "t1", stream: true }),
      makeParams(),
    );

    expect(mockProcessTurn).toHaveBeenCalledWith(
      "game-1",
      "go north",
      "t1",
      { mode: "copilot", githubToken: "gh-token-abc" },
      mockSettings,
      expect.anything(),
      undefined,
      expect.any(Function),
    );
  });

  it("passes correct aiConfig for byok mode", async () => {
    const byokSettings = {
      ...mockSettings,
      provider: "byok" as const,
      byokConfig: {
        type: "openai" as const,
        baseUrl: "https://api.openai.com/v1",
      },
    };
    mockGetSettings.mockResolvedValue(byokSettings);

    await POST(
      makeRequest({
        input: "go north",
        turnId: "t1",
        byokApiKey: "sk-test",
        stream: true,
      }),
      makeParams(),
    );

    expect(mockProcessTurn).toHaveBeenCalledWith(
      "game-1",
      "go north",
      "t1",
      {
        mode: "byok",
        byokType: "openai",
        byokBaseUrl: "https://api.openai.com/v1",
        byokApiKey: "sk-test",
      },
      byokSettings,
      expect.anything(),
      undefined,
      expect.any(Function),
    );
  });

  it("returns 500 on processor error", async () => {
    mockProcessTurn.mockRejectedValue(new Error("AI provider failed"));
    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/AI provider failed/);
  });

  it("returns a clear storage error when Redis is misconfigured", async () => {
    mockGetStorage.mockImplementation(() => {
      throw new Error("Missing Upstash Redis configuration");
    });

    const res = await POST(
      makeRequest({ input: "go north", turnId: "t1" }),
      makeParams(),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Storage failed: Missing Upstash Redis configuration",
    });
  });
});
