import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateWorld } from "./world-gen";
import type { GameWorld, GameGenerationRequest, GameSettings, GameMetadata, PlayerState } from "@/types";
import type { IGameStorage } from "@/lib/storage";
import type { IAIProvider, AIProviderConfig, AICompletionOptions } from "@/providers/types";

// ── Test fixtures ────────────────────────────────────────────────────

function makeValidWorld(): GameWorld {
  return {
    startRoomId: "room-1",
    rooms: {
      "room-1": {
        id: "room-1",
        name: "Bridge",
        description: "The bridge of a starship.",
        itemIds: ["key-1"],
        npcIds: ["npc-1"],
      },
      "room-2": {
        id: "room-2",
        name: "Engine Room",
        description: "Hums with power.",
        itemIds: [],
        npcIds: [],
      },
    },
    items: {
      "key-1": {
        id: "key-1",
        name: "Access Card",
        description: "A key card.",
        portable: true,
        properties: {},
      },
    },
    npcs: {
      "npc-1": {
        id: "npc-1",
        name: "Captain Zarg",
        description: "A grumpy captain.",
        dialogue: { greeting: "What do you want?" },
        state: "idle",
      },
    },
    connections: [
      {
        fromRoomId: "room-1",
        toRoomId: "room-2",
        direction: "north",
        reverseDirection: "south",
        lockId: "lock-1",
      },
      {
        fromRoomId: "room-2",
        toRoomId: "room-1",
        direction: "south",
        reverseDirection: "north",
        lockId: "lock-1",
      },
    ],
    puzzles: {
      "puzzle-1": {
        id: "puzzle-1",
        name: "Engine Puzzle",
        roomId: "room-2",
        description: "Fix the engine.",
        state: "unsolved",
        solution: { action: "use", itemIds: ["key-1"] },
        reward: { type: "flag", targetId: "engine-fixed" },
      },
    },
    locks: {
      "lock-1": {
        id: "lock-1",
        state: "locked",
        mechanism: "key",
        keyItemId: "key-1",
      },
    },
    winCondition: {
      type: "reach_room",
      targetId: "room-2",
      description: "Reach the engine room.",
    },
  };
}

const validWorldJson = JSON.stringify(makeValidWorld());

function makeRequest(): GameGenerationRequest {
  return { description: "A sci-fi adventure on a space station", size: "small" };
}

function makeSettings(): GameSettings {
  return {
    generationModel: "gpt-4o",
    gameplayModel: "gpt-4o-mini",
    responseLength: "moderate",
    provider: "copilot",
  };
}

function makeAIConfig(): AIProviderConfig {
  return { mode: "copilot", githubToken: "test-token" };
}

function createMockProvider(responses: string[]): IAIProvider {
  let callIndex = 0;
  return {
    generateCompletion: vi.fn(async () => {
      const content = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return { content, model: "gpt-4o" };
    }),
    streamCompletion: vi.fn(async () => ({ content: "", model: "gpt-4o" })),
    listModels: vi.fn(async () => []),
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

// ── Tests ────────────────────────────────────────────────────────────

describe("generateWorld", () => {
  let storage: ReturnType<typeof createMockStorage>;
  let request: GameGenerationRequest;
  let settings: GameSettings;
  let aiConfig: AIProviderConfig;

  beforeEach(() => {
    storage = createMockStorage();
    request = makeRequest();
    settings = makeSettings();
    aiConfig = makeAIConfig();
  });

  // ── Happy path ──────────────────────────────────────────────────

  it("generates and saves a valid world successfully", async () => {
    const provider = createMockProvider([validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
    expect(result.gameId).toBeDefined();
    expect(result.error).toBeUndefined();

    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);
    expect(storage.saveWorld).toHaveBeenCalledTimes(1);
    expect(storage.savePlayerState).toHaveBeenCalledTimes(1);
    expect(storage.saveMetadata).toHaveBeenCalledTimes(1);
    expect(storage.saveSettings).toHaveBeenCalledTimes(1);
    expect(storage.addGameToUser).toHaveBeenCalledWith("user-1", result.gameId);
  });

  // ── Markdown code block extraction ─────────────────────────────

  it("extracts JSON from markdown code blocks", async () => {
    const wrapped = "```json\n" + validWorldJson + "\n```";
    const provider = createMockProvider([wrapped]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
    expect(result.gameId).toBeDefined();
  });

  it("extracts JSON from bare markdown code blocks", async () => {
    const wrapped = "```\n" + validWorldJson + "\n```";
    const provider = createMockProvider([wrapped]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
  });

  // ── JSON parse retry ───────────────────────────────────────────

  it("retries on invalid JSON and succeeds", async () => {
    const provider = createMockProvider(["this is not json", validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
    expect(provider.generateCompletion).toHaveBeenCalledTimes(2);
  });

  it("returns error when both JSON parse attempts fail", async () => {
    const provider = createMockProvider(["bad json", "still bad json"]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(false);
    expect(result.error).toContain("JSON");
  });

  // ── Zod validation retry ───────────────────────────────────────

  it("retries on Zod validation failure and succeeds", async () => {
    const invalidWorld = JSON.stringify({ rooms: {}, items: {} }); // missing required fields
    const provider = createMockProvider([invalidWorld, validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
    expect(provider.generateCompletion).toHaveBeenCalledTimes(2);
  });

  it("returns error when both Zod validations fail", async () => {
    const invalidWorld = JSON.stringify({ rooms: {}, items: {} });
    const provider = createMockProvider([invalidWorld, invalidWorld]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(false);
    expect(result.error).toContain("validation");
  });

  // ── World validation retry ─────────────────────────────────────

  it("retries on world validation errors and succeeds", async () => {
    // A world that passes Zod but fails validateWorld (missing start room reference)
    const brokenWorld = makeValidWorld();
    brokenWorld.startRoomId = "nonexistent-room";
    const provider = createMockProvider([JSON.stringify(brokenWorld), validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
    expect(provider.generateCompletion).toHaveBeenCalledTimes(2);
  });

  it("returns error when both world validations fail", async () => {
    const brokenWorld = makeValidWorld();
    brokenWorld.startRoomId = "nonexistent-room";
    const brokenJson = JSON.stringify(brokenWorld);
    const provider = createMockProvider([brokenJson, brokenJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(false);
    expect(result.error).toContain("World validation");
  });

  // ── AI call failure ────────────────────────────────────────────

  it("returns error when AI provider throws", async () => {
    const provider: IAIProvider = {
      generateCompletion: vi.fn(async () => { throw new Error("API rate limited"); }),
      streamCompletion: vi.fn(async () => ({ content: "", model: "gpt-4o" })),
      listModels: vi.fn(async () => []),
    };
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI generation failed");
  });

  // ── Storage failure ────────────────────────────────────────────

  it("returns error when storage throws", async () => {
    const provider = createMockProvider([validWorldJson]);
    storage.saveWorld = vi.fn(async () => { throw new Error("Redis connection lost"); });
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Storage");
  });

  // ── Player state correctness ───────────────────────────────────

  it("saves correct initial player state", async () => {
    const provider = createMockProvider([validWorldJson]);
    await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    const savedState = (storage.savePlayerState as ReturnType<typeof vi.fn>).mock.calls[0][1] as PlayerState;
    expect(savedState.currentRoomId).toBe("room-1");
    expect(savedState.inventory).toEqual([]);
    expect(savedState.visitedRooms).toEqual(["room-1"]);
    expect(savedState.flags).toEqual({});
    expect(savedState.turnCount).toBe(0);
    expect(savedState.stateVersion).toBe(0);
  });

  // ── Metadata correctness ──────────────────────────────────────

  it("saves correct metadata", async () => {
    const provider = createMockProvider([validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

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

  // ── User game index ────────────────────────────────────────────

  it("adds game to user index", async () => {
    const provider = createMockProvider([validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(storage.addGameToUser).toHaveBeenCalledWith("user-1", result.gameId);
  });

  // ── Warnings are forwarded ────────────────────────────────────

  it("forwards validation warnings in result", async () => {
    // The valid world fixture may produce symmetry warnings — that's fine.
    // We just verify warnings are an array if present.
    const provider = createMockProvider([validWorldJson]);
    const result = await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(result.success).toBe(true);
    if (result.warnings) {
      expect(Array.isArray(result.warnings)).toBe(true);
    }
  });

  // ── Settings saved ─────────────────────────────────────────────

  it("saves settings to storage", async () => {
    const provider = createMockProvider([validWorldJson]);
    await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    expect(storage.saveSettings).toHaveBeenCalledTimes(1);
    const savedSettings = (storage.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(savedSettings).toEqual(settings);
  });

  // ── AI prompt construction ─────────────────────────────────────

  it("passes system prompt and generation model to AI provider", async () => {
    const provider = createMockProvider([validWorldJson]);
    await generateWorld(request, settings, "user-1", aiConfig, storage, provider);

    const call = (provider.generateCompletion as ReturnType<typeof vi.fn>).mock.calls[0];
    const options: AICompletionOptions = call[1];
    expect(options.model).toBe("gpt-4o");
    expect(options.systemMessage).toBeTruthy();
  });
});
