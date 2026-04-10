import { describe, it, expect } from "vitest";
import {
  DirectionSchema,
  RoomSchema,
  ItemSchema,
  NPCSchema,
  ConnectionSchema,
  PuzzleSchema,
  LockSchema,
  WinConditionSchema,
  GameWorldSchema,
  PlayerStateSchema,
  TurnEntrySchema,
  GameSizeSchema,
  GameSettingsSchema,
  GameMetadataSchema,
  GameStateSchema,
  AITurnResponseSchema,
  ProposedActionSchema,
  GameGenerationRequestSchema,
} from "./schemas";

// ── Helpers ─────────────────────────────────────────────────────────

function validRoom(overrides = {}) {
  return {
    id: "room-1",
    name: "Dark Cave",
    description: "A damp, dark cave.",
    itemIds: ["item-1"],
    npcIds: [],
    ...overrides,
  };
}

function validItem(overrides = {}) {
  return {
    id: "item-1",
    name: "Rusty Key",
    description: "An old rusty key.",
    portable: true,
    properties: { weight: 1, material: "iron", magical: false },
    ...overrides,
  };
}

function validNPC(overrides = {}) {
  return {
    id: "npc-1",
    name: "Old Sage",
    description: "A wise sage.",
    dialogue: { greeting: "Hello traveler.", quest: "Find the amulet." },
    state: "greeting",
    ...overrides,
  };
}

function validConnection(overrides = {}) {
  return {
    fromRoomId: "room-1",
    toRoomId: "room-2",
    direction: "north" as const,
    reverseDirection: "south" as const,
    ...overrides,
  };
}

function validPuzzle(overrides = {}) {
  return {
    id: "puzzle-1",
    name: "Locked Chest",
    roomId: "room-1",
    description: "A locked chest.",
    state: "unsolved" as const,
    solution: { action: "use_key", itemIds: ["item-1"] },
    reward: { type: "item" as const, targetId: "item-2" },
    ...overrides,
  };
}

function validLock(overrides = {}) {
  return {
    id: "lock-1",
    state: "locked" as const,
    mechanism: "key" as const,
    keyItemId: "item-1",
    ...overrides,
  };
}

function validWinCondition(overrides = {}) {
  return {
    type: "reach_room" as const,
    targetId: "room-5",
    description: "Reach the throne room.",
    ...overrides,
  };
}

function validPlayerState(overrides = {}) {
  return {
    currentRoomId: "room-1",
    inventory: [],
    visitedRooms: ["room-1"],
    flags: {},
    turnCount: 0,
    stateVersion: 1,
    ...overrides,
  };
}

function validTurnEntry(overrides = {}) {
  return {
    turnId: "turn-1",
    role: "player" as const,
    text: "look around",
    timestamp: Date.now(),
    ...overrides,
  };
}

function validGameSettings(overrides = {}) {
  return {
    generationModel: "gpt-4o",
    gameplayModel: "gpt-4o-mini",
    responseLength: "moderate" as const,
    provider: "copilot" as const,
    ...overrides,
  };
}

function validGameMetadata(overrides = {}) {
  return {
    id: "game-1",
    userId: "user-1",
    title: "The Dark Quest",
    description: "An adventure in darkness.",
    size: "medium" as const,
    createdAt: Date.now(),
    lastPlayedAt: Date.now(),
    turnCount: 0,
    completed: false,
    ...overrides,
  };
}

function validGameWorld(overrides = {}) {
  return {
    rooms: { "room-1": validRoom(), "room-2": validRoom({ id: "room-2", name: "Forest" }) },
    items: { "item-1": validItem() },
    npcs: { "npc-1": validNPC() },
    connections: [validConnection()],
    puzzles: { "puzzle-1": validPuzzle() },
    locks: { "lock-1": validLock() },
    winCondition: validWinCondition(),
    startRoomId: "room-1",
    ...overrides,
  };
}

function validGameState() {
  return {
    metadata: validGameMetadata(),
    world: validGameWorld(),
    player: validPlayerState(),
    history: [validTurnEntry()],
    settings: validGameSettings(),
  };
}

// ── Direction ───────────────────────────────────────────────────────

describe("DirectionSchema", () => {
  it("accepts valid directions", () => {
    for (const dir of ["north", "south", "east", "west", "up", "down"]) {
      expect(DirectionSchema.safeParse(dir).success).toBe(true);
    }
  });

  it("rejects invalid direction", () => {
    expect(DirectionSchema.safeParse("northeast").success).toBe(false);
    expect(DirectionSchema.safeParse(42).success).toBe(false);
    expect(DirectionSchema.safeParse("").success).toBe(false);
  });
});

// ── Room ────────────────────────────────────────────────────────────

describe("RoomSchema", () => {
  it("accepts a valid room", () => {
    expect(RoomSchema.safeParse(validRoom()).success).toBe(true);
  });

  it("accepts room with optional firstVisitText", () => {
    const result = RoomSchema.safeParse(validRoom({ firstVisitText: "You enter for the first time." }));
    expect(result.success).toBe(true);
  });

  it("rejects room missing required fields", () => {
    expect(RoomSchema.safeParse({ id: "room-1" }).success).toBe(false);
    expect(RoomSchema.safeParse({}).success).toBe(false);
  });

  it("rejects room with wrong types", () => {
    expect(RoomSchema.safeParse(validRoom({ itemIds: "not-an-array" })).success).toBe(false);
    expect(RoomSchema.safeParse(validRoom({ name: 42 })).success).toBe(false);
  });
});

// ── Item ────────────────────────────────────────────────────────────

describe("ItemSchema", () => {
  it("accepts a valid item", () => {
    expect(ItemSchema.safeParse(validItem()).success).toBe(true);
  });

  it("accepts item with optional usableWith", () => {
    const result = ItemSchema.safeParse(validItem({ usableWith: ["item-2", "npc-1"] }));
    expect(result.success).toBe(true);
  });

  it("rejects item with wrong portable type", () => {
    expect(ItemSchema.safeParse(validItem({ portable: "yes" })).success).toBe(false);
  });

  it("accepts properties with mixed value types", () => {
    const result = ItemSchema.safeParse(
      validItem({ properties: { weight: 5, name: "sword", enchanted: true } }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects item missing properties field", () => {
    const { properties: _, ...noProps } = validItem();
    expect(ItemSchema.safeParse(noProps).success).toBe(false);
  });
});

// ── NPC ─────────────────────────────────────────────────────────────

describe("NPCSchema", () => {
  it("accepts a valid NPC", () => {
    expect(NPCSchema.safeParse(validNPC()).success).toBe(true);
  });

  it("rejects NPC with non-string dialogue values", () => {
    expect(NPCSchema.safeParse(validNPC({ dialogue: { greeting: 42 } })).success).toBe(false);
  });

  it("rejects NPC missing state", () => {
    const { state: _, ...noState } = validNPC();
    expect(NPCSchema.safeParse(noState).success).toBe(false);
  });
});

// ── Connection ──────────────────────────────────────────────────────

describe("ConnectionSchema", () => {
  it("accepts a valid connection", () => {
    expect(ConnectionSchema.safeParse(validConnection()).success).toBe(true);
  });

  it("accepts connection with optional fields", () => {
    const result = ConnectionSchema.safeParse(
      validConnection({ lockId: "lock-1", hidden: true, description: "A secret passage." }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects connection with invalid direction", () => {
    expect(ConnectionSchema.safeParse(validConnection({ direction: "diagonal" })).success).toBe(false);
  });
});

// ── Puzzle ───────────────────────────────────────────────────────────

describe("PuzzleSchema", () => {
  it("accepts a valid puzzle", () => {
    expect(PuzzleSchema.safeParse(validPuzzle()).success).toBe(true);
  });

  it("rejects puzzle with invalid state", () => {
    expect(PuzzleSchema.safeParse(validPuzzle({ state: "in_progress" })).success).toBe(false);
  });

  it("rejects puzzle with invalid reward type", () => {
    expect(
      PuzzleSchema.safeParse(
        validPuzzle({ reward: { type: "destroy", targetId: "x" } }),
      ).success,
    ).toBe(false);
  });

  it("accepts puzzle solution with optional fields", () => {
    const result = PuzzleSchema.safeParse(
      validPuzzle({ solution: { action: "talk", npcId: "npc-1" } }),
    );
    expect(result.success).toBe(true);
  });
});

// ── Lock ────────────────────────────────────────────────────────────

describe("LockSchema", () => {
  it("accepts a valid lock", () => {
    expect(LockSchema.safeParse(validLock()).success).toBe(true);
  });

  it("rejects lock with invalid mechanism", () => {
    expect(LockSchema.safeParse(validLock({ mechanism: "magic" })).success).toBe(false);
  });

  it("accepts lock with optional puzzleId", () => {
    const result = LockSchema.safeParse(
      validLock({ mechanism: "puzzle", puzzleId: "puzzle-1", keyItemId: undefined }),
    );
    expect(result.success).toBe(true);
  });
});

// ── WinCondition ────────────────────────────────────────────────────

describe("WinConditionSchema", () => {
  it("accepts all valid types", () => {
    for (const type of ["reach_room", "collect_items", "solve_puzzle", "flag"]) {
      expect(
        WinConditionSchema.safeParse({ type, targetId: "t1", description: "desc" }).success,
      ).toBe(true);
    }
  });

  it("rejects invalid type", () => {
    expect(
      WinConditionSchema.safeParse({ type: "defeat_boss", targetId: "t1", description: "desc" })
        .success,
    ).toBe(false);
  });
});

// ── GameWorld ────────────────────────────────────────────────────────

describe("GameWorldSchema", () => {
  it("accepts a valid game world", () => {
    const result = GameWorldSchema.safeParse(validGameWorld());
    expect(result.success).toBe(true);
  });

  it("rejects game world missing rooms", () => {
    const { rooms: _, ...noRooms } = validGameWorld();
    expect(GameWorldSchema.safeParse(noRooms).success).toBe(false);
  });

  it("rejects game world with invalid nested data", () => {
    const world = validGameWorld();
    world.rooms["room-1"] = { id: "room-1" } as never;
    expect(GameWorldSchema.safeParse(world).success).toBe(false);
  });
});

// ── PlayerState ─────────────────────────────────────────────────────

describe("PlayerStateSchema", () => {
  it("accepts valid player state", () => {
    expect(PlayerStateSchema.safeParse(validPlayerState()).success).toBe(true);
  });

  it("rejects negative turnCount", () => {
    expect(PlayerStateSchema.safeParse(validPlayerState({ turnCount: -1 })).success).toBe(false);
  });

  it("rejects negative stateVersion", () => {
    expect(PlayerStateSchema.safeParse(validPlayerState({ stateVersion: -5 })).success).toBe(false);
  });

  it("rejects non-boolean flags", () => {
    expect(
      PlayerStateSchema.safeParse(validPlayerState({ flags: { key: "yes" } })).success,
    ).toBe(false);
  });
});

// ── TurnEntry ───────────────────────────────────────────────────────

describe("TurnEntrySchema", () => {
  it("accepts valid turn entry", () => {
    expect(TurnEntrySchema.safeParse(validTurnEntry()).success).toBe(true);
  });

  it("rejects invalid role", () => {
    expect(TurnEntrySchema.safeParse(validTurnEntry({ role: "system" })).success).toBe(false);
  });
});

// ── GameSize ────────────────────────────────────────────────────────

describe("GameSizeSchema", () => {
  it("accepts all valid sizes", () => {
    for (const size of ["small", "medium", "large", "epic"]) {
      expect(GameSizeSchema.safeParse(size).success).toBe(true);
    }
  });

  it("rejects invalid size", () => {
    expect(GameSizeSchema.safeParse("tiny").success).toBe(false);
  });
});

// ── GameSettings ────────────────────────────────────────────────────

describe("GameSettingsSchema", () => {
  it("accepts valid settings with copilot provider", () => {
    expect(GameSettingsSchema.safeParse(validGameSettings()).success).toBe(true);
  });

  it("accepts settings with byok provider and config", () => {
    const result = GameSettingsSchema.safeParse(
      validGameSettings({
        provider: "byok",
        byokConfig: { type: "openai", baseUrl: "https://api.example.com" },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects invalid responseLength", () => {
    expect(
      GameSettingsSchema.safeParse(validGameSettings({ responseLength: "verbose" })).success,
    ).toBe(false);
  });
});

// ── GameMetadata ────────────────────────────────────────────────────

describe("GameMetadataSchema", () => {
  it("accepts valid metadata", () => {
    expect(GameMetadataSchema.safeParse(validGameMetadata()).success).toBe(true);
  });

  it("rejects metadata with invalid size", () => {
    expect(GameMetadataSchema.safeParse(validGameMetadata({ size: "huge" })).success).toBe(false);
  });
});

// ── ProposedAction (discriminated union) ────────────────────────────

describe("ProposedActionSchema", () => {
  it("accepts move action", () => {
    const result = ProposedActionSchema.safeParse({ type: "move", direction: "north" });
    expect(result.success).toBe(true);
  });

  it("accepts pickup action", () => {
    const result = ProposedActionSchema.safeParse({ type: "pickup", itemId: "item-1" });
    expect(result.success).toBe(true);
  });

  it("accepts drop action", () => {
    const result = ProposedActionSchema.safeParse({ type: "drop", itemId: "item-1" });
    expect(result.success).toBe(true);
  });

  it("accepts use_item action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "use_item",
      itemId: "item-1",
      targetId: "npc-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts unlock action with optional itemId", () => {
    expect(
      ProposedActionSchema.safeParse({ type: "unlock", lockId: "lock-1" }).success,
    ).toBe(true);
    expect(
      ProposedActionSchema.safeParse({ type: "unlock", lockId: "lock-1", itemId: "item-1" })
        .success,
    ).toBe(true);
  });

  it("accepts solve_puzzle action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "solve_puzzle",
      puzzleId: "puzzle-1",
      action: "use_key",
      itemIds: ["item-1"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts talk_npc action", () => {
    const result = ProposedActionSchema.safeParse({ type: "talk_npc", npcId: "npc-1" });
    expect(result.success).toBe(true);
  });

  it("accepts npc_state_change action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "npc_state_change",
      npcId: "npc-1",
      newState: "quest_given",
    });
    expect(result.success).toBe(true);
  });

  it("accepts set_flag action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "set_flag",
      flag: "dragon_slain",
      value: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts reveal_connection action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "reveal_connection",
      fromRoomId: "room-1",
      toRoomId: "room-2",
    });
    expect(result.success).toBe(true);
  });

  it("accepts add_item_to_room action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "add_item_to_room",
      itemId: "item-1",
      roomId: "room-2",
    });
    expect(result.success).toBe(true);
  });

  it("accepts remove_item_from_room action", () => {
    const result = ProposedActionSchema.safeParse({
      type: "remove_item_from_room",
      itemId: "item-1",
      roomId: "room-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown action type", () => {
    expect(
      ProposedActionSchema.safeParse({ type: "fly", destination: "moon" }).success,
    ).toBe(false);
  });

  it("rejects move with missing direction", () => {
    expect(ProposedActionSchema.safeParse({ type: "move" }).success).toBe(false);
  });

  it("rejects pickup with missing itemId", () => {
    expect(ProposedActionSchema.safeParse({ type: "pickup" }).success).toBe(false);
  });
});

// ── AITurnResponse ──────────────────────────────────────────────────

describe("AITurnResponseSchema", () => {
  it("accepts valid response with multiple actions", () => {
    const result = AITurnResponseSchema.safeParse({
      narrative: "You swing the rusty sword.",
      proposedActions: [
        { type: "move", direction: "north" },
        { type: "set_flag", flag: "entered_cave", value: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with empty actions array", () => {
    const result = AITurnResponseSchema.safeParse({
      narrative: "Nothing happens.",
      proposedActions: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects response with invalid action in array", () => {
    const result = AITurnResponseSchema.safeParse({
      narrative: "You try something weird.",
      proposedActions: [{ type: "teleport", destination: "moon" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects response missing narrative", () => {
    expect(
      AITurnResponseSchema.safeParse({ proposedActions: [] }).success,
    ).toBe(false);
  });
});

// ── GameGenerationRequest ───────────────────────────────────────────

describe("GameGenerationRequestSchema", () => {
  it("accepts valid request", () => {
    const result = GameGenerationRequestSchema.safeParse({
      description: "A spooky haunted mansion",
      size: "medium",
    });
    expect(result.success).toBe(true);
  });

  it("accepts request with optional genre", () => {
    const result = GameGenerationRequestSchema.safeParse({
      description: "A spooky haunted mansion",
      size: "medium",
      genre: "horror",
    });
    expect(result.success).toBe(true);
  });

  it("rejects request with empty description", () => {
    const result = GameGenerationRequestSchema.safeParse({
      description: "",
      size: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("rejects request with invalid size", () => {
    const result = GameGenerationRequestSchema.safeParse({
      description: "An adventure",
      size: "massive",
    });
    expect(result.success).toBe(false);
  });
});

// ── Full GameState ──────────────────────────────────────────────────

describe("GameStateSchema", () => {
  it("accepts a complete valid game state", () => {
    const result = GameStateSchema.safeParse(validGameState());
    expect(result.success).toBe(true);
  });

  it("rejects game state missing world", () => {
    const { world: _, ...noWorld } = validGameState();
    expect(GameStateSchema.safeParse(noWorld).success).toBe(false);
  });

  it("rejects game state with invalid history entry", () => {
    const state = validGameState();
    state.history.push({ turnId: "t2", role: "system" as never, text: "x", timestamp: 0 });
    expect(GameStateSchema.safeParse(state).success).toBe(false);
  });
});
