import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateWorld } from "./world-gen";
import { validateWorld } from "@/engine";
import type {
  GameGenerationRequest,
  GameMetadata,
  GameSettings,
  PlayerState,
} from "@/types";
import type { IGameStorage } from "@/lib/storage";
import * as storageModule from "@/lib/storage";

function makeRequest(overrides: Partial<GameGenerationRequest> = {}): GameGenerationRequest {
  return {
    description: "A sci-fi adventure on a malfunctioning orbital platform",
    size: "small",
    ...overrides,
  };
}

function makeSettings(): GameSettings {
  return {
    generationModel: "gpt-4o",
    gameplayModel: "gpt-4o-mini",
    responseLength: "moderate",
    provider: "copilot",
  };
}

function createMockStorage(): IGameStorage {
  return {
    saveWorld: vi.fn(async () => {}),
    getWorld: vi.fn(async () => null),
    savePlayerState: vi.fn(async () => {}),
    getPlayerState: vi.fn(async () => null),
    updatePlayerState: vi.fn(async () => true),
    appendHistory: vi.fn(async () => {}),
    getHistory: vi.fn(async () => []),
    saveSettings: vi.fn(async () => {}),
    getSettings: vi.fn(async () => null),
    saveMetadata: vi.fn(async () => {}),
    getMetadata: vi.fn(async () => null),
    addGameToUser: vi.fn(async () => {}),
    removeGameFromUser: vi.fn(async () => {}),
    getUserGames: vi.fn(async () => []),
    deleteGame: vi.fn(async () => {}),
    gameExists: vi.fn(async () => false),
  };
}

describe("generateWorld", () => {
  let storage: ReturnType<typeof createMockStorage>;
  let request: GameGenerationRequest;
  let settings: GameSettings;

  beforeEach(() => {
    storage = createMockStorage();
    request = makeRequest();
    settings = makeSettings();
  });

  it("generates and saves a valid deterministic world successfully", async () => {
    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    expect(result.success).toBe(true);
    expect(result.gameId).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(storage.saveWorld).toHaveBeenCalledTimes(1);
    expect(storage.savePlayerState).toHaveBeenCalledTimes(1);
    expect(storage.saveMetadata).toHaveBeenCalledTimes(1);
    expect(storage.saveSettings).toHaveBeenCalledTimes(1);
    expect(storage.addGameToUser).toHaveBeenCalledWith("user-1", result.gameId);
  });

  it("saves a world that passes validation", async () => {
    await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    const savedWorld = (storage.saveWorld as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const validation = validateWorld(savedWorld);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("stores a generation seed in game metadata", async () => {
    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    expect(result.success).toBe(true);

    const savedMeta = (storage.saveMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as GameMetadata;
    expect(savedMeta.generationSeed).toEqual(expect.any(String));
    expect(savedMeta.generationSeed).not.toHaveLength(0);
  });

  it("stores correct initial player state", async () => {
    await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    const savedState = (storage.savePlayerState as ReturnType<typeof vi.fn>).mock.calls[0][1] as PlayerState;
    expect(savedState.inventory).toEqual([]);
    expect(savedState.visitedRooms).toHaveLength(1);
    expect(savedState.currentRoomId).toBe(savedState.visitedRooms[0]);
    expect(savedState.flags).toEqual({});
    expect(savedState.turnCount).toBe(0);
    expect(savedState.stateVersion).toBe(0);
  });

  it("saves correct metadata", async () => {
    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    const savedMeta = (storage.saveMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as GameMetadata;
    expect(savedMeta.id).toBe(result.gameId);
    expect(savedMeta.userId).toBe("user-1");
    expect(savedMeta.description).toBe(request.description);
    expect(savedMeta.size).toBe("small");
    expect(savedMeta.turnCount).toBe(0);
    expect(savedMeta.completed).toBe(false);
    expect(savedMeta.createdAt).toBeGreaterThan(0);
    expect(savedMeta.lastPlayedAt).toBeGreaterThan(0);
    expect(typeof savedMeta.title).toBe("string");
    expect(savedMeta.title.length).toBeGreaterThan(0);
  });

  it("builds worlds with unique directions per room and no mirrored duplicate corridors", async () => {
    await generateWorld(
      makeRequest({ size: "epic" }),
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    const savedWorld = (storage.saveWorld as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const directionsByRoom = new Map<string, string[]>();
    const seenPairs = new Set<string>();

    for (const connection of savedWorld.connections) {
      const pairKey = [connection.fromRoomId, connection.toRoomId].sort().join("::");
      expect(seenPairs.has(pairKey)).toBe(false);
      seenPairs.add(pairKey);

      directionsByRoom.set(connection.fromRoomId, [
        ...(directionsByRoom.get(connection.fromRoomId) ?? []),
        connection.direction,
      ]);
      directionsByRoom.set(connection.toRoomId, [
        ...(directionsByRoom.get(connection.toRoomId) ?? []),
        connection.reverseDirection,
      ]);
    }

    for (const directions of directionsByRoom.values()) {
      expect(new Set(directions).size).toBe(directions.length);
      expect(directions.length).toBeLessThanOrEqual(6);
    }
  });

  it("saves settings to storage", async () => {
    await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    expect(storage.saveSettings).toHaveBeenCalledTimes(1);
    const savedSettings = (storage.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(savedSettings).toEqual(settings);
  });

  it("returns error when storage throws", async () => {
    storage.saveWorld = vi.fn(async () => {
      throw new Error("Redis connection lost");
    });

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Storage");
  });

  it("returns error when storage initialization throws", async () => {
    const getStorageSpy = vi.spyOn(storageModule, "getStorage").mockImplementation(() => {
      throw new Error("Missing Upstash Redis configuration");
    });

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Storage failed");
    expect(result.error).toContain("Missing Upstash Redis configuration");

    getStorageSpy.mockRestore();
  });
});
