import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { GameMetadata, GameWorld, PlayerState, TurnEntry, GameSettings } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const mockStorage = {
  getUserGames: vi.fn(),
  getMetadata: vi.fn(),
  getWorld: vi.fn(),
  getPlayerState: vi.fn(),
  getHistory: vi.fn(),
  getSettings: vi.fn(),
  deleteGame: vi.fn(),
  gameExists: vi.fn(),
};
const mockGetStorage = vi.fn(() => mockStorage);
vi.mock("@/lib/storage", () => ({
  GameStorage: vi.fn(),
  getStorage: () => mockGetStorage(),
  formatStorageError: (error: unknown) =>
    `Storage failed: ${error instanceof Error ? error.message : String(error)}`,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { GET } from "@/app/api/games/route";
import { GET as GET_GAME, DELETE as DELETE_GAME } from "@/app/api/game/[id]/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const userId = "user@example.com";
const session = { user: { id: "github-user-123", email: userId } };

function makeMetadata(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id: "game-1",
    userId,
    title: "Test Game",
    description: "A test game",
    size: "small",
    createdAt: 1000,
    lastPlayedAt: 2000,
    turnCount: 5,
    completed: false,
    ...overrides,
  };
}

const sampleWorld: GameWorld = {
  rooms: { r1: { id: "r1", name: "Start", description: "Starting room", itemIds: [], npcIds: [] } },
  items: {},
  npcs: {},
  interactables: {},
  connections: [],
  puzzles: {},
  locks: {},
  winCondition: { type: "reach_room", targetId: "r1", description: "Win" },
  startRoomId: "r1",
};

const samplePlayer: PlayerState = {
  currentRoomId: "r1",
  inventory: [],
  visitedRooms: ["r1"],
  flags: {},
  turnCount: 5,
  stateVersion: 1,
};

const sampleHistory: TurnEntry[] = [
  { turnId: "t1", role: "narrator", text: "Welcome", timestamp: 1000 },
];

const sampleSettings: GameSettings = {
  generationModel: "gpt-4",
  gameplayModel: "gpt-4",
  responseLength: "moderate",
  provider: "copilot",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function gamesRequest() {
  return new NextRequest("http://localhost/api/games");
}

function gameRequest(id: string, method = "GET") {
  return new NextRequest(`http://localhost/api/game/${id}`, { method });
}

function gameParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockGetStorage.mockImplementation(() => mockStorage);
});

describe("GET /api/games", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(gamesRequest());
    expect(res.status).toBe(401);
  });

  it("returns empty array for new user", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getUserGames.mockResolvedValue([]);
    const res = await GET(gamesRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.games).toEqual([]);
  });

  it("returns games sorted by lastPlayedAt descending", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getUserGames.mockResolvedValue(["g1", "g2", "g3"]);
    mockStorage.getMetadata
      .mockResolvedValueOnce(makeMetadata({ id: "g1", lastPlayedAt: 1000 }))
      .mockResolvedValueOnce(makeMetadata({ id: "g2", lastPlayedAt: 3000 }))
      .mockResolvedValueOnce(makeMetadata({ id: "g3", lastPlayedAt: 2000 }));

    const res = await GET(gamesRequest());
    const body = await res.json();
    expect(body.games.map((g: GameMetadata) => g.id)).toEqual(["g2", "g3", "g1"]);
  });

  it("filters out null metadata (orphaned entries)", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getUserGames.mockResolvedValue(["g1", "g2"]);
    mockStorage.getMetadata
      .mockResolvedValueOnce(makeMetadata({ id: "g1" }))
      .mockResolvedValueOnce(null);

    const res = await GET(gamesRequest());
    const body = await res.json();
    expect(body.games).toHaveLength(1);
    expect(body.games[0].id).toBe("g1");
  });

  it("merges games indexed by either session user.id or email", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getUserGames
      .mockResolvedValueOnce(["email-game", "shared-game"])
      .mockResolvedValueOnce(["id-game", "shared-game"]);
    mockStorage.getMetadata
      .mockResolvedValueOnce(makeMetadata({ id: "email-game", userId }))
      .mockResolvedValueOnce(
        makeMetadata({ id: "shared-game", userId: session.user.id }),
      )
      .mockResolvedValueOnce(
        makeMetadata({ id: "id-game", userId: session.user.id }),
      );

    const res = await GET(gamesRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockStorage.getUserGames).toHaveBeenNthCalledWith(1, session.user.id);
    expect(mockStorage.getUserGames).toHaveBeenNthCalledWith(2, userId);
    expect(body.games.map((g: GameMetadata) => g.id).sort()).toEqual([
      "email-game",
      "id-game",
      "shared-game",
    ]);
  });

  it("returns a clear storage error when Redis is misconfigured", async () => {
    mockAuth.mockResolvedValue(session);
    mockGetStorage.mockImplementation(() => {
      throw new Error("Missing Upstash Redis configuration");
    });

    const res = await GET(gamesRequest());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Storage failed: Missing Upstash Redis configuration",
    });
  });
});

describe("GET /api/game/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_GAME(gameRequest("test-id"), gameParams("test-id"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing game", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getMetadata.mockResolvedValue(null);
    const res = await GET_GAME(gameRequest("missing"), gameParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 for wrong user", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getMetadata.mockResolvedValue(makeMetadata({ userId: "other@example.com" }));
    const res = await GET_GAME(gameRequest("game-1"), gameParams("game-1"));
    expect(res.status).toBe(403);
  });

  it("returns full game state", async () => {
    mockAuth.mockResolvedValue(session);
    const meta = makeMetadata();
    mockStorage.getMetadata.mockResolvedValue(meta);
    mockStorage.getWorld.mockResolvedValue(sampleWorld);
    mockStorage.getPlayerState.mockResolvedValue(samplePlayer);
    mockStorage.getHistory.mockResolvedValue(sampleHistory);
    mockStorage.getSettings.mockResolvedValue(sampleSettings);

    const res = await GET_GAME(gameRequest("game-1"), gameParams("game-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toEqual(meta);
    expect(body.world).toEqual(sampleWorld);
    expect(body.player).toEqual(samplePlayer);
    expect(body.history).toEqual(sampleHistory);
    expect(body.settings).toEqual(sampleSettings);
  });

  it("returns full game state for games owned by session user.id", async () => {
    mockAuth.mockResolvedValue(session);
    const meta = makeMetadata({ userId: session.user.id });
    mockStorage.getMetadata.mockResolvedValue(meta);
    mockStorage.getWorld.mockResolvedValue(sampleWorld);
    mockStorage.getPlayerState.mockResolvedValue(samplePlayer);
    mockStorage.getHistory.mockResolvedValue(sampleHistory);
    mockStorage.getSettings.mockResolvedValue(sampleSettings);

    const res = await GET_GAME(gameRequest("game-1"), gameParams("game-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toEqual(meta);
  });

  it("returns a clear storage error when loading storage fails", async () => {
    mockAuth.mockResolvedValue(session);
    mockGetStorage.mockImplementation(() => {
      throw new Error("Missing Upstash Redis configuration");
    });

    const res = await GET_GAME(gameRequest("game-1"), gameParams("game-1"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Storage failed: Missing Upstash Redis configuration",
    });
  });
});

describe("DELETE /api/game/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE_GAME(gameRequest("test-id", "DELETE"), gameParams("test-id"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing game", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getMetadata.mockResolvedValue(null);
    const res = await DELETE_GAME(gameRequest("missing", "DELETE"), gameParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 for wrong user", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getMetadata.mockResolvedValue(makeMetadata({ userId: "other@example.com" }));
    const res = await DELETE_GAME(gameRequest("game-1", "DELETE"), gameParams("game-1"));
    expect(res.status).toBe(403);
  });

  it("deletes successfully", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getMetadata.mockResolvedValue(makeMetadata());
    mockStorage.deleteGame.mockResolvedValue(undefined);

    const res = await DELETE_GAME(gameRequest("game-1", "DELETE"), gameParams("game-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockStorage.deleteGame).toHaveBeenCalledWith("game-1", userId);
  });

  it("deletes games indexed by session user.id using the stored owner id", async () => {
    mockAuth.mockResolvedValue(session);
    mockStorage.getMetadata.mockResolvedValue(
      makeMetadata({ userId: session.user.id }),
    );
    mockStorage.deleteGame.mockResolvedValue(undefined);

    const res = await DELETE_GAME(
      gameRequest("game-1", "DELETE"),
      gameParams("game-1"),
    );

    expect(res.status).toBe(200);
    expect(mockStorage.deleteGame).toHaveBeenCalledWith(
      "game-1",
      session.user.id,
    );
  });

  it("returns a clear storage error when delete storage initialization fails", async () => {
    mockAuth.mockResolvedValue(session);
    mockGetStorage.mockImplementation(() => {
      throw new Error("Missing Upstash Redis configuration");
    });

    const res = await DELETE_GAME(
      gameRequest("game-1", "DELETE"),
      gameParams("game-1"),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Storage failed: Missing Upstash Redis configuration",
    });
  });
});
