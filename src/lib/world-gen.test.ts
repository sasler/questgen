import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateWorld } from "./world-gen";
import { validateWorld } from "@/engine";
import type {
  GameGenerationRequest,
  GameMetadata,
  GameSettings,
  PlayerState,
} from "@/types";
import type { AICompletionOptions, IAIProvider } from "@/providers/types";
import type { IGameStorage } from "@/lib/storage";
import * as storageModule from "@/lib/storage";
import * as deterministicWorldModule from "@/lib/deterministic-world";

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

function createMockProvider(response: string | string[]): IAIProvider {
  const queuedResponses = Array.isArray(response) ? [...response] : [response];
  const fallbackResponse = queuedResponses.at(-1) ?? "";

  return {
    generateCompletion: vi.fn(async () => ({
      content: queuedResponses.shift() ?? fallbackResponse,
      model: "gpt-4o",
    })),
    streamCompletion: vi.fn(async () => ({
      content: fallbackResponse,
      model: "gpt-4o",
    })),
    listModels: vi.fn(async () => []),
  };
}

function getRoomCount(size: GameGenerationRequest["size"]): number {
  switch (size) {
    case "small":
      return 6;
    case "medium":
      return 9;
    case "large":
      return 14;
    case "epic":
      return 20;
  }
}

function buildGeneratedContent(size: GameGenerationRequest["size"]): string {
  const scaffold = deterministicWorldModule.buildDeterministicWorld(
    makeRequest({ size }),
    "fixture-seed",
  );

  const rooms = Object.fromEntries(
    Object.keys(scaffold.rooms).map((roomId, index) => [
      roomId,
      {
        name: `Generated Room ${index + 1}`,
        description: `Generated description for ${roomId}.`,
        ...(index === 0
          ? { firstVisitText: "A generated opening scene with suspicious confidence." }
          : {}),
      },
    ]),
  );

  const items = Object.fromEntries(
    Object.keys(scaffold.items).map((itemId, index) => [
      itemId,
      {
        name: `Generated Item ${index + 1}`,
        description: `Generated description for ${itemId}.`,
      },
    ]),
  );

  const npcs = Object.fromEntries(
    Object.keys(scaffold.npcs).map((npcId, index) => [
      npcId,
      {
        name: `Generated NPC ${index + 1}`,
        description: `Generated description for ${npcId}.`,
        dialogue: {
          greeting: `Generated greeting ${index + 1}.`,
        },
      },
    ]),
  );

  const interactables = Object.fromEntries(
    Object.keys(scaffold.interactables).map((interactableId, index) => [
      interactableId,
      {
        name: `Generated Interactable ${index + 1}`,
        description: `Generated description for ${interactableId}.`,
        aliases: [`generated interactable ${index + 1}`, interactableId],
      },
    ]),
  );

  const puzzles = Object.fromEntries(
    Object.keys(scaffold.puzzles).map((puzzleId, index) => [
      puzzleId,
      {
        name: `Generated Puzzle ${index + 1}`,
        description: `Generated description for ${puzzleId}.`,
        solutionDescription: `Generated solution instructions for ${puzzleId}.`,
      },
    ]),
  );

  const locks = Object.fromEntries(
    Object.keys(scaffold.locks).map((lockId) => [
      lockId,
      {
        conditionDescription: `Generated lock condition for ${lockId}.`,
      },
    ]),
  );

  return JSON.stringify({
    rooms,
    items,
    npcs,
    interactables,
    puzzles,
    locks,
    winCondition: {
      description: "Reach the final generated room once the generated gate opens.",
    },
  });
}

describe("generateWorld", () => {
  let storage: ReturnType<typeof createMockStorage>;
  let request: GameGenerationRequest;
  let settings: GameSettings;
  let provider: IAIProvider;

  beforeEach(() => {
    storage = createMockStorage();
    request = makeRequest();
    settings = makeSettings();
    provider = createMockProvider(buildGeneratedContent(request.size));
  });

  it("generates and saves a valid deterministic world successfully", async () => {
    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
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
      provider,
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
      provider,
    );

    expect(result.success).toBe(true);

    const savedMeta = (storage.saveMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1] as GameMetadata;
    expect(savedMeta.generationSeed).toEqual(expect.any(String));
    expect(savedMeta.generationSeed).not.toHaveLength(0);
  });

  it("uses the generation model to enrich the structural scaffold with AI-authored entities", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        rooms: {
          "room-1": {
            name: "Reception Loop",
            description: "A reception desk waits for optimism to report for duty.",
            firstVisitText:
              "You arrive in Reception Loop, which seems designed by committees with a grudge.",
          },
          "room-2": {
            name: "Paperwork Junction",
            description: "Forms drift here with all the menace of polite entropy.",
          },
          "room-3": {
            name: "Relay Grotto",
            description: "A relay chamber hums like it has seen too much.",
          },
          "room-4": {
            name: "Seal Antechamber",
            description: "An antechamber where doors go to cultivate resentment.",
          },
          "room-5": {
            name: "Operations Sanctum",
            description: "The sanctum of operations glows with thinly veiled disappointment.",
          },
          "room-6": {
            name: "Annex of Regrettable Supplies",
            description: "Supplies rest here under light administrative suspicion.",
          },
        },
        items: {
          "progression-item-1": {
            name: "Quantum Maintenance Satchel",
            description: "A satchel full of tools and one implement that denies all accountability.",
          },
          "lore-item-1": {
            name: "Escalation Memo",
            description: "A memo documenting why the emergency was filed under 'later'.",
          },
        },
        npcs: {
          "guide-npc-1": {
            name: "Clerk Thimble",
            description: "A clerk who radiates the patient despair of processed paperwork.",
            dialogue: {
              greeting:
                "If you are here to fix the station, kindly collect a receipt from causality first.",
            },
          },
        },
        interactables: {
          "puzzle-target-1": {
            name: "Probability Relay",
            description: "A relay array blinking with offended statistics.",
            aliases: ["relay", "probability relay", "array"],
          },
          "final-gate-target-1": {
            name: "Executive Seal",
            description: "A final seal guarding operations with ceremonial bitterness.",
            aliases: ["seal", "executive seal", "door"],
          },
        },
        puzzles: {
          "progression-puzzle-1": {
            name: "Relay Probability Audit",
            description: "The relay must be audited with tools before reality signs off on progress.",
            solutionDescription:
              "Use the Quantum Maintenance Satchel on the Probability Relay to steady the system.",
          },
        },
        locks: {
          "final-gate-lock-1": {
            description: "The executive seal remains shut until the relay stops improvising.",
            conditionDescription:
              "Stabilize the Probability Relay to open the Executive Seal.",
          },
        },
        winCondition: {
          description: "Reach operations once the Executive Seal relents.",
        },
      }),
    );

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(true);

    const savedWorld = (storage.saveWorld as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(savedWorld.rooms["room-1"].name).toBe("Reception Loop");
    expect(savedWorld.items["progression-item-1"].name).toBe("Quantum Maintenance Satchel");
    expect(savedWorld.npcs["guide-npc-1"].name).toBe("Clerk Thimble");
    expect(savedWorld.interactables["puzzle-target-1"].name).toBe("Probability Relay");
    expect(savedWorld.puzzles["progression-puzzle-1"].name).toBe("Relay Probability Audit");
    expect(savedWorld.locks["final-gate-lock-1"].conditionDescription).toContain(
      "Probability Relay",
    );

    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);
    const promptCall = (provider.generateCompletion as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, AICompletionOptions];
    expect(promptCall[0]).toContain("Structural scaffold");
    expect(promptCall[1].model).toBe(settings.generationModel);
  });

  it("passes 120 s timeout to every generateCompletion call", async () => {
    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    const calls = (provider.generateCompletion as ReturnType<typeof vi.fn>).mock
      .calls as Array<[string, AICompletionOptions]>;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, opts] of calls) {
      expect(opts.timeout).toBe(90_000);
    }
  });

  it("retries with a repair prompt when the first AI-authored world fails scaffold validation", async () => {
    const provider = createMockProvider([
      JSON.stringify({
        rooms: {
          "room-1": {
            name: "Only One Room",
            description: "This draft is incomplete.",
          },
        },
        items: {},
        npcs: {},
        interactables: {},
        puzzles: {},
        locks: {},
        winCondition: {
          description: "Still incomplete.",
        },
      }),
      buildGeneratedContent(request.size),
    ]);

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(provider.generateCompletion).toHaveBeenCalledTimes(2);

    const repairPrompt = (provider.generateCompletion as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(repairPrompt).toContain("Repair the authored world");
    expect(repairPrompt).toContain("Missing room content");
  });

  it("fails generation when AI content does not satisfy the deterministic scaffold", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        rooms: {
          "room-1": {
            name: "Only One Room",
            description: "This is nowhere near enough data.",
          },
        },
        items: {},
        npcs: {},
        interactables: {},
        puzzles: {},
        locks: {},
      }),
    );

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI world content");
    expect(storage.saveWorld).not.toHaveBeenCalled();
  });

  it("fails generation when AI omits the required win condition description", async () => {
    const generatedContent = JSON.parse(buildGeneratedContent(request.size)) as Record<string, unknown>;
    delete generatedContent.winCondition;
    const provider = createMockProvider(JSON.stringify(generatedContent));

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI world content");
  });

  it("repairs missing start-room first-visit text instead of falling back to a hardcoded template", async () => {
    const generatedContent = JSON.parse(buildGeneratedContent(request.size)) as {
      rooms: Record<string, { name: string; description: string; firstVisitText?: string }>;
    };
    generatedContent.rooms["room-1"] = {
      name: "New Arrival Hall",
      description: "A newly named arrival hall with administrative overconfidence.",
    };
    const provider = createMockProvider([
      JSON.stringify(generatedContent),
      buildGeneratedContent(request.size),
    ]);

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(true);

    const savedWorld = (storage.saveWorld as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(savedWorld.rooms["room-1"].firstVisitText).toContain(
      "A generated opening scene with suspicious confidence.",
    );
    expect(savedWorld.rooms["room-1"].firstVisitText).not.toContain(
      "clipboard lost an argument",
    );
  });

  it("stores correct initial player state", async () => {
    await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
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
      provider,
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
    const epicRequest = makeRequest({ size: "epic" });
    const epicProvider = createMockProvider(buildGeneratedContent(epicRequest.size));
    await generateWorld(
      epicRequest,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      epicProvider,
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
      provider,
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
      provider,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Storage");
  });

  it("returns error when deterministic generation throws", async () => {
    const generatorSpy = vi
      .spyOn(deterministicWorldModule, "buildDeterministicWorld")
      .mockImplementation(() => {
        throw new Error("Unable to place main-path room");
      });

    const result = await generateWorld(
      request,
      settings,
      "user-1",
      { mode: "copilot", githubToken: "test-token" },
      storage,
      provider,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("World generation failed");
    expect(result.error).toContain("Unable to place main-path room");

    generatorSpy.mockRestore();
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
