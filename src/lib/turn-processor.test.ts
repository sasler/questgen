import { describe, it, expect, vi } from "vitest";
import { processTurn } from "./turn-processor";
import type { GameWorld, PlayerState, TurnEntry, GameMetadata, GameSettings } from "@/types";
import type { IGameStorage } from "@/lib/storage";
import type { IAIProvider, AIProviderConfig, AICompletionOptions } from "@/providers/types";

// ── Test helpers ────────────────────────────────────────────────────

function createTestWorld(overrides?: Partial<GameWorld>): GameWorld {
  const world: GameWorld = {
    rooms: {
      room1: {
        id: "room1",
        name: "Starting Room",
        description: "A simple room.",
        itemIds: ["key1"],
        npcIds: ["guard1"],
      },
      room2: {
        id: "room2",
        name: "Second Room",
        description: "Another room.",
        itemIds: [],
        npcIds: [],
        firstVisitText: "You feel a chill.",
      },
      room3: {
        id: "room3",
        name: "Locked Room",
        description: "Behind a locked door.",
        itemIds: [],
        npcIds: [],
      },
      "win-room": {
        id: "win-room",
        name: "Victory Chamber",
        description: "You won!",
        itemIds: [],
        npcIds: [],
      },
    },
    items: {
      key1: {
        id: "key1",
        name: "Iron Key",
        description: "A rusty key.",
        portable: true,
        usableWith: ["lock1"],
        properties: {},
      },
    },
    npcs: {
      guard1: {
        id: "guard1",
        name: "Guard",
        description: "A stern guard.",
        dialogue: { default: "Halt!" },
        state: "idle",
      },
    },
    interactables: {},
    connections: [
      {
        fromRoomId: "room1",
        toRoomId: "room2",
        direction: "north",
        reverseDirection: "south",
      },
      {
        fromRoomId: "room1",
        toRoomId: "room3",
        direction: "east",
        reverseDirection: "west",
        lockId: "lock1",
      },
      {
        fromRoomId: "room2",
        toRoomId: "win-room",
        direction: "north",
        reverseDirection: "south",
      },
    ],
    puzzles: {
      puzzle1: {
        id: "puzzle1",
        name: "Guard Puzzle",
        roomId: "room1",
        description: "Convince the guard.",
        state: "unsolved",
        solution: { action: "bribe", itemIds: ["key1"] },
        reward: { type: "unlock", targetId: "lock1" },
      },
    },
    locks: {
      lock1: {
        id: "lock1",
        state: "locked",
        mechanism: "key",
        keyItemId: "key1",
      },
    },
    winCondition: {
      type: "reach_room",
      targetId: "win-room",
      description: "Reach the Victory Chamber",
    },
    startRoomId: "room1",
  };

  return {
    ...world,
    ...overrides,
    interactables: overrides?.interactables ?? world.interactables,
  };
}

function createTestPlayer(overrides?: Partial<PlayerState>): PlayerState {
  return {
    currentRoomId: "room1",
    inventory: [],
    visitedRooms: ["room1"],
    flags: {},
    turnCount: 0,
    stateVersion: 1,
    ...overrides,
  };
}

function createTestMetadata(overrides?: Partial<GameMetadata>): GameMetadata {
  return {
    id: "game-1",
    userId: "user-1",
    title: "Test Adventure",
    description: "A test game",
    size: "small",
    createdAt: 1000,
    lastPlayedAt: 1000,
    turnCount: 0,
    completed: false,
    ...overrides,
  };
}

function createTestSettings(overrides?: Partial<GameSettings>): GameSettings {
  return {
    generationModel: "gpt-4",
    gameplayModel: "gpt-4",
    responseLength: "moderate",
    provider: "copilot",
    ...overrides,
  };
}

const defaultAIConfig: AIProviderConfig = {
  mode: "copilot",
  githubToken: "test-token",
};

function createMockStorage(overrides?: {
  world?: GameWorld | null;
  player?: PlayerState | null;
  history?: TurnEntry[];
  metadata?: GameMetadata | null;
  settings?: GameSettings | null;
  updatePlayerStateResult?: boolean;
}): IGameStorage {
  const {
    world = createTestWorld(),
    player = createTestPlayer(),
    history = [],
    metadata = createTestMetadata(),
    settings = createTestSettings(),
    updatePlayerStateResult = true,
  } = overrides ?? {};

  return {
    getWorld: vi.fn().mockResolvedValue(world),
    getPlayerState: vi.fn().mockResolvedValue(player),
    getHistory: vi.fn().mockResolvedValue(history),
    getMetadata: vi.fn().mockResolvedValue(metadata),
    getSettings: vi.fn().mockResolvedValue(settings),
    updatePlayerState: vi.fn().mockResolvedValue(updatePlayerStateResult),
    appendHistory: vi.fn().mockResolvedValue(undefined),
    saveMetadata: vi.fn().mockResolvedValue(undefined),
    saveWorld: vi.fn().mockResolvedValue(undefined),
    savePlayerState: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    addGameToUser: vi.fn().mockResolvedValue(undefined),
    removeGameFromUser: vi.fn().mockResolvedValue(undefined),
    getUserGames: vi.fn().mockResolvedValue([]),
    deleteGame: vi.fn().mockResolvedValue(undefined),
    gameExists: vi.fn().mockResolvedValue(true),
  };
}

function createMockProvider(response: string | string[]): IAIProvider {
  const queuedResponses = Array.isArray(response) ? [...response] : [response];
  let finalNarrative = Array.isArray(response) ? response.at(-1) ?? "" : response;

  if (!Array.isArray(response)) {
    try {
      const stripped = response.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
      const firstBrace = stripped.indexOf("{");
      const lastBrace = stripped.lastIndexOf("}");
      const candidate =
        firstBrace >= 0 && lastBrace > firstBrace
          ? stripped.slice(firstBrace, lastBrace + 1)
          : response;
      const parsed = JSON.parse(candidate) as { narrative?: string };
      if (typeof parsed.narrative === "string") {
        finalNarrative = parsed.narrative;
      }
    } catch {}
  }

  return {
    generateCompletion: vi.fn().mockImplementation(async () => {
      const nextResponse = queuedResponses.shift();
      return {
        content: nextResponse ?? finalNarrative,
        model: "gpt-4",
        finishReason: "stop",
      };
    }),
    streamCompletion: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
  };
}

function aiResponse(narrative: string, proposedActions: unknown[] = []) {
  return JSON.stringify({ narrative, proposedActions });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("processTurn", () => {
  // ── 1. Happy path: move action ──────────────────────────────────

  it("should process a move action and save state", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      aiResponse("You walk north into the second room.", [
        { type: "move", direction: "north" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "go north",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toBe("You move north to Second Room. You feel a chill.");
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0].success).toBe(true);
    expect(result.newPlayerState.currentRoomId).toBe("room2");
    expect(result.gameWon).toBe(false);
    expect(result.worldChanged).toBe(false);

    // Verify state was saved
    expect(storage.updatePlayerState).toHaveBeenCalledOnce();
    expect(storage.appendHistory).toHaveBeenCalledTimes(2); // player + narrator
    expect(storage.saveMetadata).toHaveBeenCalledOnce();
  });

  // ── 2. Multiple actions validated in sequence ───────────────────

  it("should process multiple actions in sequence", async () => {
    const player = createTestPlayer();
    const storage = createMockStorage({ player });
    const provider = createMockProvider(
      aiResponse("You grab the key and head north.", [
        { type: "pickup", itemId: "key1" },
        { type: "move", direction: "north" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "grab the key and go north",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.actionResults).toHaveLength(2);
    expect(result.actionResults[0].success).toBe(true); // pickup
    expect(result.actionResults[1].success).toBe(true); // move
    expect(result.newPlayerState.currentRoomId).toBe("room2");
    expect(result.newPlayerState.inventory).toContain("key1");
  });

  // ── 3. Invalid action rejected, narrative still returned ────────

  it("should reject invalid action but still return narrative", async () => {
    const storage = createMockStorage();
    // Move east is locked
    const provider = createMockProvider(
      aiResponse("You try to go east but the door is locked.", [
        { type: "move", direction: "east" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "go east",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toBe("You try to go east but the door is locked.");
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0].success).toBe(false);
    // Player should not have moved
    expect(result.newPlayerState.currentRoomId).toBe("room1");
  });

  // ── 4. Unparseable AI response → fallback narrative ─────────────

  it("should return fallback narrative for unparseable AI response", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider("This is not JSON at all!");

    const result = await processTurn(
      "game-1",
      "look around",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toContain("momentarily lost track");
    expect(result.actionResults).toHaveLength(0);
    // State should not change
    expect(result.newPlayerState.stateVersion).toBe(1);
  });

  // ── 5. Optimistic locking conflict ──────────────────────────────

  it("should return error on optimistic locking conflict", async () => {
    const storage = createMockStorage({ updatePlayerStateResult: false });
    const provider = createMockProvider(
      aiResponse("You walk north.", [
        { type: "move", direction: "north" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "go north",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("conflict");
  });

  it("returns a conflict error if persistence fails after narration generation", async () => {
    const storage = createMockStorage({ updatePlayerStateResult: false });
    const provider = createMockProvider([
      aiResponse("You inspect the room carefully.", []),
      "You inspect the room carefully.",
    ]);

    const result = await processTurn(
      "game-1",
      "inspect room",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("conflict");
  });

  // ── 6. Win condition detected ───────────────────────────────────

  it("should detect win condition when player reaches win room", async () => {
    // Start in room2, which connects north to win-room
    const player = createTestPlayer({ currentRoomId: "room2" });
    const storage = createMockStorage({ player });
    const provider = createMockProvider(
      aiResponse("You step into the Victory Chamber!", [
        { type: "move", direction: "north" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "go north",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.gameWon).toBe(true);
    expect(result.newPlayerState.currentRoomId).toBe("win-room");

    // Metadata should be updated with completed=true
    const savedMetadata = (storage.saveMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(savedMetadata.completed).toBe(true);
  });

  // ── 7. World-mutating actions ───────────────────────────────────

  it("should detect world changes from unlock action and save world", async () => {
    const player = createTestPlayer({ inventory: ["key1"] });
    const storage = createMockStorage({ player });
    const provider = createMockProvider(
      aiResponse("You unlock the door with the iron key.", [
        { type: "unlock", lockId: "lock1", itemId: "key1" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "unlock east door",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.actionResults[0].success).toBe(true);
    expect(result.worldChanged).toBe(true);

    // World should have been saved
    expect(storage.saveWorld).toHaveBeenCalledOnce();
  });

  it("should detect world changes from pickup action and save world", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      aiResponse("You pocket the iron key.", [{ type: "pickup", itemId: "key1" }])
    );

    const result = await processTurn(
      "game-1",
      "take key",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.actionResults[0].success).toBe(true);
    expect(result.newPlayerState.inventory).toContain("key1");
    expect(result.worldChanged).toBe(true);
    expect(storage.saveWorld).toHaveBeenCalledOnce();
  });

  it("should detect world changes from use_item unlocking a lock and save world", async () => {
    const player = createTestPlayer({ inventory: ["key1"] });
    const storage = createMockStorage({ player });
    const provider = createMockProvider(
      aiResponse("You use the key on the lock.", [
        { type: "use_item", itemId: "key1", targetId: "lock1" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "use key on east door",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.actionResults[0].success).toBe(true);
    expect(result.worldChanged).toBe(true);
    expect(storage.saveWorld).toHaveBeenCalledOnce();
  });

  it("should detect world changes from solve_puzzle action", async () => {
    const player = createTestPlayer({ inventory: ["key1"] });
    const storage = createMockStorage({ player });
    const provider = createMockProvider(
      aiResponse("You solve the puzzle!", [
        { type: "solve_puzzle", puzzleId: "puzzle1", action: "bribe", itemIds: ["key1"] },
      ])
    );

    const result = await processTurn(
      "game-1",
      "bribe the guard",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.worldChanged).toBe(true);
    expect(storage.saveWorld).toHaveBeenCalledOnce();
  });

  it("should detect world changes from reveal_connection action", async () => {
    const world = createTestWorld();
    // Add a hidden connection
    world.connections.push({
      fromRoomId: "room1",
      toRoomId: "win-room",
      direction: "up",
      reverseDirection: "down",
      hidden: true,
    });
    const storage = createMockStorage({ world });
    const provider = createMockProvider(
      aiResponse("A hidden passage is revealed!", [
        { type: "reveal_connection", fromRoomId: "room1", toRoomId: "win-room" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "search for secrets",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.worldChanged).toBe(true);
    expect(storage.saveWorld).toHaveBeenCalledOnce();
  });

  it("should detect world changes from npc_state_change action", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      aiResponse("The guard calms down.", [
        { type: "npc_state_change", npcId: "guard1", newState: "friendly" },
      ])
    );

    const result = await processTurn(
      "game-1",
      "calm the guard",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.worldChanged).toBe(true);
    expect(storage.saveWorld).toHaveBeenCalledOnce();
  });

  // ── 8. Storage load failure ─────────────────────────────────────

  it("should return error when world is not found", async () => {
    const storage = createMockStorage({ world: null });
    const provider = createMockProvider(aiResponse("hello", []));

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should return error when player state is not found", async () => {
    const storage = createMockStorage({ player: null });
    const provider = createMockProvider(aiResponse("hello", []));

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should return error when metadata is not found", async () => {
    const storage = createMockStorage({ metadata: null });
    const provider = createMockProvider(aiResponse("hello", []));

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should return error when storage throws", async () => {
    const storage = createMockStorage();
    (storage.getWorld as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Redis connection failed")
    );
    const provider = createMockProvider(aiResponse("hello", []));

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Redis connection failed");
  });

  // ── 9. History entries created correctly ─────────────────────────

  it("should create two history entries: player and narrator", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      aiResponse("You look around the room.", [])
    );

    await processTurn(
      "game-1",
      "look around",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    const appendCalls = (storage.appendHistory as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls).toHaveLength(2);

    // First entry: player
    const playerEntry: TurnEntry = appendCalls[0][1];
    expect(playerEntry.role).toBe("player");
    expect(playerEntry.text).toBe("look around");
    expect(playerEntry.turnId).toBe("turn-1");

    // Second entry: narrator
    const narratorEntry: TurnEntry = appendCalls[1][1];
    expect(narratorEntry.role).toBe("narrator");
    expect(narratorEntry.text).toBe("You look around the room.");
    expect(narratorEntry.turnId).toBe("turn-1");
  });

  it("should return validated narration instead of speculative proposal narration", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      "The door remains stubbornly locked, which is exactly the sort of optimism-correction the universe specializes in.",
    );

    const result = await processTurn(
      "game-1",
      "go east",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0].success).toBe(false);
    expect(result.narrative).toBe(
      "The door remains stubbornly locked, which is exactly the sort of optimism-correction the universe specializes in.",
    );
    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);

    const narratorEntry = (storage.appendHistory as ReturnType<typeof vi.fn>).mock.calls[1][1];
    expect(narratorEntry.text).toBe(result.narrative);
  });

  it("deterministically follows the real room graph for direct movement commands", async () => {
    const player = createTestPlayer({
      currentRoomId: "room2",
      visitedRooms: ["room1", "room2"],
    });
    const storage = createMockStorage({ player });
    const provider = createMockProvider([
      "You head back south with all the grace of a reasonably competent mammal.",
    ]);

    const result = await processTurn(
      "game-1",
      "south",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0]).toMatchObject({
      success: true,
      message: expect.stringContaining("move south"),
    });
    expect(result.newPlayerState.currentRoomId).toBe("room1");
    expect(provider.generateCompletion).not.toHaveBeenCalled();
    expect(storage.saveWorld).not.toHaveBeenCalled();
  });

  it("falls back to deterministic narration when the prose model contradicts a successful move", async () => {
    const player = createTestPlayer({
      currentRoomId: "room2",
      visitedRooms: ["room1", "room2"],
    });
    const storage = createMockStorage({ player });
    const provider = createMockProvider([
      "You attempt to head south, but the universe insists you are already in the Starting Room and going nowhere.",
    ]);

    const result = await processTurn(
      "game-1",
      "south",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.newPlayerState.currentRoomId).toBe("room1");
    expect(result.narrative).toContain("You move south to Starting Room.");
    expect(result.narrative).not.toContain("already in");
  });

  it("treats 'can't go' phrasing as a contradiction for a successful move", async () => {
    const player = createTestPlayer({
      currentRoomId: "room2",
      visitedRooms: ["room1", "room2"],
    });
    const storage = createMockStorage({ player });
    const provider = createMockProvider([
      "You can't go that way, because the universe has apparently unionized against progress.",
    ]);

    const result = await processTurn(
      "game-1",
      "south",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toContain("You move south to Starting Room.");
  });

  it("uses deterministic narration for successful moves even when the prose model would be valid", async () => {
    const player = createTestPlayer({
      currentRoomId: "room2",
      visitedRooms: ["room1", "room2"],
    });
    const storage = createMockStorage({ player });
    const provider = createMockProvider([
      "You pass through the previously locked bulkhead and arrive in the Starting Room with only modest dignity loss.",
    ]);

    const result = await processTurn(
      "game-1",
      "south",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toContain("You move south to Starting Room.");
    expect(provider.generateCompletion).not.toHaveBeenCalled();
  });

  it("uses deterministic narration for successful moves even when the destination contains locked objects", async () => {
    const player = createTestPlayer({
      currentRoomId: "room2",
      visitedRooms: ["room1", "room2"],
    });
    const storage = createMockStorage({ player });
    const provider = createMockProvider([
      "You arrive in the Starting Room. A maintenance locker is locked in the corner, radiating petty resolve.",
    ]);

    const result = await processTurn(
      "game-1",
      "south",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toContain("You move south to Starting Room.");
    expect(provider.generateCompletion).not.toHaveBeenCalled();
  });

  it("deterministically resolves hinted use-item commands against interactable aliases", async () => {
    const world = createTestWorld({
      items: {
        toolkit: {
          id: "toolkit",
          name: "Maintenance Toolkit",
          description: "A toolkit full of suspiciously optimistic tools.",
          portable: true,
          usableWith: ["relay-console"],
          properties: {},
        },
      },
      interactables: {
        "relay-console": {
          id: "relay-console",
          roomId: "room1",
          name: "Relay Console",
          description: "A relay console that badly needs a competent toolkit.",
          aliases: ["console", "relay", "relay console"],
          state: "offline",
          properties: {},
        },
      },
      puzzles: {
        "relay-puzzle": {
          id: "relay-puzzle",
          name: "Relay Calibration",
          roomId: "room1",
          description: "The relay will cooperate if someone uses the toolkit on it.",
          state: "unsolved",
          solution: {
            action: "use",
            itemIds: ["toolkit"],
            targetInteractableId: "relay-console",
            targetState: "online",
          },
          reward: { type: "unlock", targetId: "lock1" },
        },
      },
      locks: {
        lock1: {
          id: "lock1",
          state: "locked",
          mechanism: "puzzle",
          puzzleId: "relay-puzzle",
        },
      },
    });
    const player = createTestPlayer({ inventory: ["toolkit"] });
    const storage = createMockStorage({ world, player });
    const provider = createMockProvider([
      "The relay console finally stops impersonating scrap metal and starts working.",
    ]);

    const result = await processTurn(
      "game-1",
      "use toolkit on relay console",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0].success).toBe(true);
    expect(result.worldChanged).toBe(true);
    expect(result.narrative).toContain("relay console");
    expect(storage.saveWorld).toHaveBeenCalledOnce();

    const savedWorld = (storage.saveWorld as ReturnType<typeof vi.fn>).mock.calls[0][1] as GameWorld;
    expect(savedWorld.interactables["relay-console"].state).toBe("online");
    expect(savedWorld.puzzles["relay-puzzle"].state).toBe("solved");
    expect(savedWorld.locks["lock1"].state).toBe("unlocked");
    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not deterministically resolve an item command for items outside the inventory", async () => {
    const world = createTestWorld({
      rooms: {
        ...createTestWorld().rooms,
        room1: {
          ...createTestWorld().rooms.room1,
          itemIds: ["toolkit"],
        },
      },
      items: {
        ...createTestWorld().items,
        toolkit: {
          id: "toolkit",
          name: "Maintenance Toolkit",
          description: "A toolkit full of suspiciously optimistic tools.",
          portable: true,
          usableWith: ["relay-console"],
          properties: {},
        },
      },
      interactables: {
        "relay-console": {
          id: "relay-console",
          roomId: "room1",
          name: "Relay Console",
          description: "A relay console that badly needs a competent toolkit.",
          aliases: ["console", "relay", "relay console"],
          state: "offline",
          properties: {},
        },
      },
    });
    const player = createTestPlayer({ inventory: [] });
    const storage = createMockStorage({ world, player });
    const provider = createMockProvider([
      aiResponse(
        "You eye the relay console, but without actually holding the toolkit this remains an aspirational maintenance strategy.",
        [],
      ),
    ]);

    const result = await processTurn(
      "game-1",
      "use toolkit on relay console",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider,
    );

    expect(result.success).toBe(true);
    expect(result.actionResults).toEqual([]);
    expect(storage.saveWorld).not.toHaveBeenCalled();
    expect(provider.generateCompletion).toHaveBeenCalledTimes(2);
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("should handle AI response wrapped in markdown code blocks", async () => {
    const storage = createMockStorage();
    const jsonContent = aiResponse("You see a room.", []);
    const provider = createMockProvider("```json\n" + jsonContent + "\n```");

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toBe("You see a room.");
  });

  it("should handle AI response with extra text around JSON", async () => {
    const storage = createMockStorage();
    const jsonContent = aiResponse("You see a door.", []);
    const provider = createMockProvider(
      "Here is the response:\n" + jsonContent + "\nEnd of response."
    );

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toBe("You see a door.");
  });

  it("should handle no actions in AI response", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      aiResponse("You stand and ponder the meaning of existence.", [])
    );

    const result = await processTurn(
      "game-1",
      "think about life",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(true);
    expect(result.narrative).toBe("You stand and ponder the meaning of existence.");
    expect(result.actionResults).toHaveLength(0);
    expect(result.worldChanged).toBe(false);
  });

  it("should pass correct model and system prompt to AI provider", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(aiResponse("Hello.", []));

    await processTurn(
      "game-1",
      "hello",
      "turn-1",
      defaultAIConfig,
      createTestSettings({ gameplayModel: "gpt-4o" }),
      storage,
      provider
    );

    const call = (provider.generateCompletion as ReturnType<typeof vi.fn>).mock.calls[0];
    const options: AICompletionOptions = call[1];
    expect(options.model).toBe("gpt-4o");
    expect(options.systemMessage).toBeDefined();
    expect(options.systemMessage.length).toBeGreaterThan(0);
  });

  it("should handle AI provider throwing an error", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider("");
    (provider.generateCompletion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API rate limited")
    );

    const result = await processTurn(
      "game-1",
      "look",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("API rate limited");
  });

  it("should not save world when no world-mutating actions occur", async () => {
    const storage = createMockStorage();
    const provider = createMockProvider(
      aiResponse("You move north.", [{ type: "move", direction: "north" }])
    );

    await processTurn(
      "game-1",
      "go north",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    expect(storage.saveWorld).not.toHaveBeenCalled();
  });

  it("should use fallback player state for unparseable response", async () => {
    const player = createTestPlayer({ stateVersion: 5, turnCount: 10 });
    const storage = createMockStorage({ player });
    const provider = createMockProvider("{{not valid json}}");

    const result = await processTurn(
      "game-1",
      "do something",
      "turn-1",
      defaultAIConfig,
      createTestSettings(),
      storage,
      provider
    );

    // State should remain unchanged from the original
    expect(result.newPlayerState.stateVersion).toBe(5);
    expect(result.newPlayerState.turnCount).toBe(10);
    expect(result.newPlayerState.currentRoomId).toBe("room1");
  });
});
