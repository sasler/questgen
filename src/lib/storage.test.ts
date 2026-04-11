import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  GameWorld,
  PlayerState,
  TurnEntry,
  GameSettings,
  GameMetadata,
} from "@/types";
import { GameStorage, getRedisConfigFromEnv } from "./storage";

// ---------------------------------------------------------------------------
// Mock Redis that stores data in-memory
// ---------------------------------------------------------------------------
function createMockRedis() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();

  return {
    get: vi.fn(async (key: string) => {
      const v = store.get(key);
      return v ? JSON.parse(v) : null;
    }),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      );
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
        if (lists.delete(k)) count++;
      }
      return count;
    }),
    exists: vi.fn(async (...keys: string[]) => {
      return keys.filter((k) => store.has(k) || lists.has(k)).length;
    }),
    lpush: vi.fn(async (key: string, ...values: string[]) => {
      if (!lists.has(key)) lists.set(key, []);
      const list = lists.get(key)!;
      // lpush prepends — newest first
      for (const v of values) {
        list.unshift(v);
      }
      return list.length;
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      // Redis LRANGE is inclusive on both ends
      return list.slice(start, stop + 1).map((v) => JSON.parse(v));
    }),
    ltrim: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key);
      if (list) {
        const trimmed = list.slice(start, stop + 1);
        lists.set(key, trimmed);
      }
      return "OK";
    }),
    // expose internals for assertions
    _store: store,
    _lists: lists,
  };
}

type MockRedis = ReturnType<typeof createMockRedis>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeWorld(): GameWorld {
  return {
    rooms: {
      room1: {
        id: "room1",
        name: "Start",
        description: "A dark room",
        itemIds: ["key1"],
        npcIds: [],
      },
    },
    items: {
      key1: {
        id: "key1",
        name: "Rusty Key",
        description: "An old key",
        portable: true,
        properties: {},
      },
    },
    npcs: {},
    connections: [],
    puzzles: {},
    locks: {},
    winCondition: {
      type: "reach_room",
      targetId: "room2",
      description: "Escape!",
    },
    startRoomId: "room1",
  };
}

function makePlayerState(version = 1): PlayerState {
  return {
    currentRoomId: "room1",
    inventory: [],
    visitedRooms: ["room1"],
    flags: {},
    turnCount: 0,
    stateVersion: version,
  };
}

function makeTurnEntry(id: string, role: "player" | "narrator" = "player"): TurnEntry {
  return {
    turnId: id,
    role,
    text: `Turn ${id}`,
    timestamp: Date.now(),
  };
}

function makeSettings(): GameSettings {
  return {
    generationModel: "gpt-4",
    gameplayModel: "gpt-3.5-turbo",
    responseLength: "moderate",
    provider: "copilot",
  };
}

function makeMetadata(gameId = "game1", userId = "user1"): GameMetadata {
  return {
    id: gameId,
    userId,
    title: "Test Adventure",
    description: "A test game",
    size: "small",
    createdAt: Date.now(),
    lastPlayedAt: Date.now(),
    turnCount: 0,
    completed: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("getRedisConfigFromEnv", () => {
  it("returns trimmed Redis config when both vars are present", () => {
    expect(
      getRedisConfigFromEnv({
        UPSTASH_REDIS_REST_URL: " https://example.upstash.io ",
        UPSTASH_REDIS_REST_TOKEN: " secret-token ",
      }),
    ).toEqual({
      url: "https://example.upstash.io",
      token: "secret-token",
    });
  });

  it("throws a clear error when Redis env vars are missing", () => {
    expect(() => getRedisConfigFromEnv({})).toThrow(
      "Missing Upstash Redis configuration. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. NEXTAUTH_URL must be your QuestGen app URL, not your Upstash URL.",
    );
  });
});

describe("GameStorage", () => {
  let redis: MockRedis;
  let storage: GameStorage;

  beforeEach(() => {
    redis = createMockRedis();
    // Cast to Redis — the mock implements the subset we use
    storage = new GameStorage(redis as unknown as import("@upstash/redis").Redis);
  });

  // ========== World ==========
  describe("World", () => {
    it("should save and retrieve a world", async () => {
      const world = makeWorld();
      await storage.saveWorld("game1", world);
      const result = await storage.getWorld("game1");
      expect(result).toEqual(world);
    });

    it("should return null for non-existent world", async () => {
      const result = await storage.getWorld("missing");
      expect(result).toBeNull();
    });

    it("should overwrite an existing world", async () => {
      const world1 = makeWorld();
      await storage.saveWorld("game1", world1);

      const world2 = { ...world1, startRoomId: "room2" };
      await storage.saveWorld("game1", world2);

      const result = await storage.getWorld("game1");
      expect(result!.startRoomId).toBe("room2");
    });
  });

  // ========== Player State ==========
  describe("PlayerState", () => {
    it("should save and retrieve player state", async () => {
      const state = makePlayerState();
      await storage.savePlayerState("game1", state);
      const result = await storage.getPlayerState("game1");
      expect(result).toEqual(state);
    });

    it("should return null for non-existent player state", async () => {
      const result = await storage.getPlayerState("missing");
      expect(result).toBeNull();
    });

    describe("optimistic locking via updatePlayerState", () => {
      it("should succeed when version matches", async () => {
        const state = makePlayerState(1);
        await storage.savePlayerState("game1", state);

        const updated = { ...state, currentRoomId: "room2", turnCount: 1 };
        const ok = await storage.updatePlayerState("game1", updated, 1);
        expect(ok).toBe(true);

        const result = await storage.getPlayerState("game1");
        expect(result!.currentRoomId).toBe("room2");
        expect(result!.stateVersion).toBe(2);
      });

      it("should fail when version doesn't match", async () => {
        const state = makePlayerState(1);
        await storage.savePlayerState("game1", state);

        const updated = { ...state, currentRoomId: "room2" };
        const ok = await storage.updatePlayerState("game1", updated, 99);
        expect(ok).toBe(false);

        // State should be unchanged
        const result = await storage.getPlayerState("game1");
        expect(result!.currentRoomId).toBe("room1");
        expect(result!.stateVersion).toBe(1);
      });

      it("should fail when player state doesn't exist", async () => {
        const state = makePlayerState(1);
        const ok = await storage.updatePlayerState("missing", state, 1);
        expect(ok).toBe(false);
      });

      it("should increment stateVersion on success", async () => {
        const state = makePlayerState(5);
        await storage.savePlayerState("game1", state);

        const ok = await storage.updatePlayerState("game1", state, 5);
        expect(ok).toBe(true);

        const result = await storage.getPlayerState("game1");
        expect(result!.stateVersion).toBe(6);
      });

      it("should allow sequential updates with correct versions", async () => {
        const state = makePlayerState(1);
        await storage.savePlayerState("game1", state);

        // First update: v1 → v2
        const ok1 = await storage.updatePlayerState(
          "game1",
          { ...state, turnCount: 1 },
          1
        );
        expect(ok1).toBe(true);

        // Second update: v2 → v3
        const ok2 = await storage.updatePlayerState(
          "game1",
          { ...state, turnCount: 2 },
          2
        );
        expect(ok2).toBe(true);

        const result = await storage.getPlayerState("game1");
        expect(result!.stateVersion).toBe(3);
        expect(result!.turnCount).toBe(2);
      });
    });
  });

  // ========== History ==========
  describe("History", () => {
    it("should append and retrieve history entries", async () => {
      const entry = makeTurnEntry("t1");
      await storage.appendHistory("game1", entry);

      const history = await storage.getHistory("game1");
      expect(history).toHaveLength(1);
      expect(history[0].turnId).toBe("t1");
    });

    it("should return entries in newest-first order", async () => {
      await storage.appendHistory("game1", makeTurnEntry("t1"));
      await storage.appendHistory("game1", makeTurnEntry("t2"));
      await storage.appendHistory("game1", makeTurnEntry("t3"));

      const history = await storage.getHistory("game1");
      expect(history.map((e) => e.turnId)).toEqual(["t3", "t2", "t1"]);
    });

    it("should return empty array for non-existent history", async () => {
      const history = await storage.getHistory("missing");
      expect(history).toEqual([]);
    });

    it("should respect the limit parameter", async () => {
      for (let i = 1; i <= 10; i++) {
        await storage.appendHistory("game1", makeTurnEntry(`t${i}`));
      }

      const history = await storage.getHistory("game1", 3);
      expect(history).toHaveLength(3);
      expect(history[0].turnId).toBe("t10");
    });

    it("should cap history at 100 entries", async () => {
      for (let i = 1; i <= 110; i++) {
        await storage.appendHistory("game1", makeTurnEntry(`t${i}`));
      }

      const history = await storage.getHistory("game1");
      expect(history).toHaveLength(100);
      // Newest should be t110, oldest should be t11 (t1-t10 trimmed)
      expect(history[0].turnId).toBe("t110");
      expect(history[99].turnId).toBe("t11");
    });

    it("should call ltrim after each lpush", async () => {
      await storage.appendHistory("game1", makeTurnEntry("t1"));
      expect(redis.ltrim).toHaveBeenCalledWith("history:game1", 0, 99);
    });
  });

  // ========== Settings ==========
  describe("Settings", () => {
    it("should save and retrieve settings", async () => {
      const settings = makeSettings();
      await storage.saveSettings("game1", settings);
      const result = await storage.getSettings("game1");
      expect(result).toEqual(settings);
    });

    it("should return null for non-existent settings", async () => {
      const result = await storage.getSettings("missing");
      expect(result).toBeNull();
    });

    it("should handle byokConfig", async () => {
      const settings: GameSettings = {
        ...makeSettings(),
        provider: "byok",
        byokConfig: { type: "openai", baseUrl: "https://api.example.com" },
      };
      await storage.saveSettings("game1", settings);
      const result = await storage.getSettings("game1");
      expect(result!.byokConfig).toEqual({
        type: "openai",
        baseUrl: "https://api.example.com",
      });
    });
  });

  // ========== Metadata ==========
  describe("Metadata", () => {
    it("should save and retrieve metadata", async () => {
      const meta = makeMetadata();
      await storage.saveMetadata("game1", meta);
      const result = await storage.getMetadata("game1");
      expect(result).toEqual(meta);
    });

    it("should return null for non-existent metadata", async () => {
      const result = await storage.getMetadata("missing");
      expect(result).toBeNull();
    });
  });

  // ========== Game Index (per user) ==========
  describe("User Games Index", () => {
    it("should add a game to user index", async () => {
      await storage.addGameToUser("user1", "game1");
      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game1"]);
    });

    it("should not duplicate game ids", async () => {
      await storage.addGameToUser("user1", "game1");
      await storage.addGameToUser("user1", "game1");
      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game1"]);
    });

    it("should support multiple games per user", async () => {
      await storage.addGameToUser("user1", "game1");
      await storage.addGameToUser("user1", "game2");
      await storage.addGameToUser("user1", "game3");
      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game1", "game2", "game3"]);
    });

    it("should remove a game from user index", async () => {
      await storage.addGameToUser("user1", "game1");
      await storage.addGameToUser("user1", "game2");
      await storage.removeGameFromUser("user1", "game1");
      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game2"]);
    });

    it("should handle removing a non-existent game gracefully", async () => {
      await storage.addGameToUser("user1", "game1");
      await storage.removeGameFromUser("user1", "nonexistent");
      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game1"]);
    });

    it("should return empty array for user with no games", async () => {
      const games = await storage.getUserGames("nobody");
      expect(games).toEqual([]);
    });
  });

  // ========== gameExists ==========
  describe("gameExists", () => {
    it("should return true when metadata exists", async () => {
      await storage.saveMetadata("game1", makeMetadata());
      const exists = await storage.gameExists("game1");
      expect(exists).toBe(true);
    });

    it("should return false when metadata doesn't exist", async () => {
      const exists = await storage.gameExists("missing");
      expect(exists).toBe(false);
    });

    it("should check the metadata key specifically", async () => {
      await storage.gameExists("game1");
      expect(redis.exists).toHaveBeenCalledWith("metadata:game1");
    });
  });

  // ========== deleteGame ==========
  describe("deleteGame", () => {
    it("should delete all keys for a game", async () => {
      await storage.saveWorld("game1", makeWorld());
      await storage.savePlayerState("game1", makePlayerState());
      await storage.appendHistory("game1", makeTurnEntry("t1"));
      await storage.saveSettings("game1", makeSettings());
      await storage.saveMetadata("game1", makeMetadata());
      await storage.addGameToUser("user1", "game1");

      await storage.deleteGame("game1", "user1");

      expect(await storage.getWorld("game1")).toBeNull();
      expect(await storage.getPlayerState("game1")).toBeNull();
      expect(await storage.getSettings("game1")).toBeNull();
      expect(await storage.getMetadata("game1")).toBeNull();
      expect(await storage.gameExists("game1")).toBe(false);
    });

    it("should remove the game from the user index", async () => {
      await storage.addGameToUser("user1", "game1");
      await storage.addGameToUser("user1", "game2");
      await storage.saveMetadata("game1", makeMetadata());

      await storage.deleteGame("game1", "user1");

      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game2"]);
    });

    it("should call del with all five game keys", async () => {
      await storage.deleteGame("game1", "user1");
      expect(redis.del).toHaveBeenCalledWith(
        "world:game1",
        "player:game1",
        "history:game1",
        "settings:game1",
        "metadata:game1"
      );
    });

    it("should not affect other games", async () => {
      await storage.saveMetadata("game1", makeMetadata("game1"));
      await storage.saveMetadata("game2", makeMetadata("game2"));
      await storage.addGameToUser("user1", "game1");
      await storage.addGameToUser("user1", "game2");

      await storage.deleteGame("game1", "user1");

      expect(await storage.getMetadata("game2")).not.toBeNull();
      const games = await storage.getUserGames("user1");
      expect(games).toEqual(["game2"]);
    });
  });

  // ========== Key structure ==========
  describe("Key structure", () => {
    it("should use correct key prefixes", async () => {
      await storage.saveWorld("g1", makeWorld());
      expect(redis.set).toHaveBeenCalledWith("world:g1", expect.any(String));

      await storage.savePlayerState("g1", makePlayerState());
      expect(redis.set).toHaveBeenCalledWith("player:g1", expect.any(String));

      await storage.saveSettings("g1", makeSettings());
      expect(redis.set).toHaveBeenCalledWith("settings:g1", expect.any(String));

      await storage.saveMetadata("g1", makeMetadata("g1"));
      expect(redis.set).toHaveBeenCalledWith("metadata:g1", expect.any(String));
    });

    it("should use history: prefix for list operations", async () => {
      await storage.appendHistory("g1", makeTurnEntry("t1"));
      expect(redis.lpush).toHaveBeenCalledWith("history:g1", expect.any(String));
    });

    it("should use games: prefix for user index", async () => {
      await storage.addGameToUser("u1", "g1");
      expect(redis.set).toHaveBeenCalledWith("games:u1", expect.any(String));
    });
  });
});
