import { describe, it, expect } from "vitest";
import { applyAction, checkWinCondition, getAvailableExits } from "./game-engine";
import type { GameWorld, PlayerState } from "@/types";

// ---------------------------------------------------------------------------
// Test helpers — build a minimal but complete game world
// ---------------------------------------------------------------------------

function createTestWorld(overrides?: Partial<GameWorld>): GameWorld {
  return {
    rooms: {
      room1: {
        id: "room1",
        name: "Starting Room",
        description: "A simple room.",
        itemIds: ["key1", "gem1"],
        npcIds: ["guard1"],
        firstVisitText: undefined,
      },
      room2: {
        id: "room2",
        name: "Second Room",
        description: "Another room.",
        itemIds: ["heavy_statue"],
        npcIds: [],
        firstVisitText: "You feel a chill.",
      },
      room3: {
        id: "room3",
        name: "Hidden Room",
        description: "A secret room.",
        itemIds: [],
        npcIds: [],
      },
      room4: {
        id: "room4",
        name: "Treasure Room",
        description: "Shiny!",
        itemIds: ["treasure"],
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
      gem1: {
        id: "gem1",
        name: "Red Gem",
        description: "A sparkling gem.",
        portable: true,
        usableWith: ["puzzle1"],
        properties: {},
      },
      heavy_statue: {
        id: "heavy_statue",
        name: "Heavy Statue",
        description: "Too heavy to carry.",
        portable: false,
        properties: {},
      },
      treasure: {
        id: "treasure",
        name: "Golden Treasure",
        description: "Priceless treasure.",
        portable: true,
        properties: {},
      },
      potion: {
        id: "potion",
        name: "Healing Potion",
        description: "Heals wounds.",
        portable: true,
        usableWith: ["guard1"],
        properties: {},
      },
    },
    npcs: {
      guard1: {
        id: "guard1",
        name: "Guard",
        description: "A burly guard.",
        dialogue: {
          hostile: "Go away!",
          friendly: "Welcome, friend!",
        },
        state: "hostile",
      },
    },
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
        hidden: true,
      },
      {
        fromRoomId: "room2",
        toRoomId: "room4",
        direction: "north",
        reverseDirection: "south",
        lockId: "lock1",
      },
    ],
    puzzles: {
      puzzle1: {
        id: "puzzle1",
        name: "Gem Puzzle",
        roomId: "room1",
        description: "Place the gem to unlock the path.",
        state: "unsolved",
        solution: { action: "place_gem", itemIds: ["gem1"] },
        reward: { type: "unlock", targetId: "lock1" },
      },
      puzzle2: {
        id: "puzzle2",
        name: "Flag Puzzle",
        roomId: "room1",
        description: "A puzzle that sets a flag.",
        state: "unsolved",
        solution: { action: "pull_lever" },
        reward: { type: "flag", targetId: "lever_pulled" },
      },
      puzzle3: {
        id: "puzzle3",
        name: "Item Reward Puzzle",
        roomId: "room2",
        description: "Rewards an item.",
        state: "unsolved",
        solution: { action: "search" },
        reward: { type: "item", targetId: "potion" },
      },
      puzzle4: {
        id: "puzzle4",
        name: "NPC Reward Puzzle",
        roomId: "room1",
        description: "Changes NPC state.",
        state: "unsolved",
        solution: { action: "bribe" },
        reward: { type: "npc_state", targetId: "guard1", value: "friendly" },
      },
    },
    locks: {
      lock1: {
        id: "lock1",
        state: "locked",
        mechanism: "key",
        keyItemId: "key1",
      },
      lock_puzzle: {
        id: "lock_puzzle",
        state: "locked",
        mechanism: "puzzle",
        puzzleId: "puzzle1",
      },
    },
    winCondition: {
      type: "reach_room",
      targetId: "room4",
      description: "Reach the treasure room.",
    },
    startRoomId: "room1",
    ...overrides,
  };
}

function createTestPlayer(overrides?: Partial<PlayerState>): PlayerState {
  return {
    currentRoomId: "room1",
    inventory: [],
    visitedRooms: ["room1"],
    flags: {},
    turnCount: 0,
    stateVersion: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MOVE
// ---------------------------------------------------------------------------
describe("move action", () => {
  it("moves player to an adjacent room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, player: newPlayer } = applyAction(
      { type: "move", direction: "north" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.currentRoomId).toBe("room2");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "player_moved" })
    );
  });

  it("adds first-visit text when visiting a new room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, player: newPlayer } = applyAction(
      { type: "move", direction: "north" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("You feel a chill");
    expect(newPlayer.visitedRooms).toContain("room2");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "room_first_visit" })
    );
  });

  it("does not add first-visit state change on revisit", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ visitedRooms: ["room1", "room2"] });
    const { result } = applyAction(
      { type: "move", direction: "north" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(
      result.stateChanges.find((sc) => sc.type === "room_first_visit")
    ).toBeUndefined();
  });

  it("fails when no exit exists in given direction", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, player: newPlayer } = applyAction(
      { type: "move", direction: "west" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(newPlayer.currentRoomId).toBe("room1");
  });

  it("fails when exit is locked", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const { result } = applyAction(
      { type: "move", direction: "north" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("locked");
  });

  it("succeeds when lock is unlocked", () => {
    const world = createTestWorld();
    world.locks["lock1"].state = "unlocked";
    const player = createTestPlayer({ currentRoomId: "room2" });
    const { result, player: newPlayer } = applyAction(
      { type: "move", direction: "north" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.currentRoomId).toBe("room4");
  });

  it("fails when exit is hidden", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "move", direction: "east" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("succeeds when hidden exit has been revealed", () => {
    const world = createTestWorld();
    world.connections[1].hidden = false;
    const player = createTestPlayer();
    const { result, player: newPlayer } = applyAction(
      { type: "move", direction: "east" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.currentRoomId).toBe("room3");
  });

  it("supports reverse direction traversal", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2", visitedRooms: ["room1", "room2"] });
    const { result, player: newPlayer } = applyAction(
      { type: "move", direction: "south" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.currentRoomId).toBe("room1");
  });

  it("increments turnCount and stateVersion on success", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { player: newPlayer } = applyAction(
      { type: "move", direction: "north" },
      world,
      player
    );

    expect(newPlayer.turnCount).toBe(1);
    expect(newPlayer.stateVersion).toBe(1);
  });

  it("does not increment turnCount on failure", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { player: newPlayer } = applyAction(
      { type: "move", direction: "west" },
      world,
      player
    );

    expect(newPlayer.turnCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PICKUP
// ---------------------------------------------------------------------------
describe("pickup action", () => {
  it("picks up a portable item from the room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, player: newPlayer, world: newWorld } = applyAction(
      { type: "pickup", itemId: "key1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.inventory).toContain("key1");
    expect(newWorld.rooms["room1"].itemIds).not.toContain("key1");
    expect(result.message).toContain("Iron Key");
  });

  it("fails when item is not in the room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "pickup", itemId: "treasure" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when item is not portable", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const { result } = applyAction(
      { type: "pickup", itemId: "heavy_statue" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("can't pick up");
  });

  it("fails when item does not exist in world", () => {
    const world = createTestWorld();
    // Add a nonexistent ID to the room so it passes the room check
    world.rooms["room1"].itemIds.push("nonexistent");
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "pickup", itemId: "nonexistent" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DROP
// ---------------------------------------------------------------------------
describe("drop action", () => {
  it("drops an item from inventory into the current room", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const { result, player: newPlayer, world: newWorld } = applyAction(
      { type: "drop", itemId: "key1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.inventory).not.toContain("key1");
    expect(newWorld.rooms["room1"].itemIds).toContain("key1");
  });

  it("fails when item is not in inventory", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "drop", itemId: "key1" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("don't have");
  });
});

// ---------------------------------------------------------------------------
// USE_ITEM
// ---------------------------------------------------------------------------
describe("use_item action", () => {
  it("uses an item on a valid target", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const { result } = applyAction(
      { type: "use_item", itemId: "key1", targetId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "item_used" })
    );
  });

  it("unlocks a lock when item is used on it", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const { result, world: newWorld } = applyAction(
      { type: "use_item", itemId: "key1", targetId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.locks["lock1"].state).toBe("unlocked");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "lock_unlocked" })
    );
  });

  it("fails when item not in inventory", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "use_item", itemId: "key1", targetId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when target does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const { result } = applyAction(
      { type: "use_item", itemId: "key1", targetId: "nonexistent" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("target does not exist");
  });

  it("fails when item is not usable with target", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { result } = applyAction(
      { type: "use_item", itemId: "gem1", targetId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("can't use");
  });

  it("uses an item on a puzzle target", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { result, world: newWorld } = applyAction(
      { type: "use_item", itemId: "gem1", targetId: "puzzle1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.puzzles["puzzle1"].state).toBe("solved");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "puzzle_solved" })
    );
  });

  it("uses an item on an NPC target", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["potion"] });
    const { result } = applyAction(
      { type: "use_item", itemId: "potion", targetId: "guard1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "item_used" })
    );
  });
});

// ---------------------------------------------------------------------------
// UNLOCK
// ---------------------------------------------------------------------------
describe("unlock action", () => {
  it("unlocks with the correct key from inventory", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const { result, world: newWorld } = applyAction(
      { type: "unlock", lockId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.locks["lock1"].state).toBe("unlocked");
  });

  it("unlocks with an explicit itemId", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const { result, world: newWorld } = applyAction(
      { type: "unlock", lockId: "lock1", itemId: "key1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.locks["lock1"].state).toBe("unlocked");
  });

  it("fails when lock does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "unlock", lockId: "nonexistent" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("does not exist");
  });

  it("fails when lock is already unlocked", () => {
    const world = createTestWorld();
    world.locks["lock1"].state = "unlocked";
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "unlock", lockId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("already unlocked");
  });

  it("fails when player doesn't have the key", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "unlock", lockId: "lock1" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("key");
  });

  it("fails with wrong key", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { result } = applyAction(
      { type: "unlock", lockId: "lock1", itemId: "gem1" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("not the right key");
  });

  it("unlocks puzzle-mechanism lock when puzzle is solved", () => {
    const world = createTestWorld();
    world.puzzles["puzzle1"].state = "solved";
    const player = createTestPlayer();
    const { result, world: newWorld } = applyAction(
      { type: "unlock", lockId: "lock_puzzle" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.locks["lock_puzzle"].state).toBe("unlocked");
  });

  it("fails puzzle-mechanism lock when puzzle is unsolved", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "unlock", lockId: "lock_puzzle" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("puzzle");
  });
});

// ---------------------------------------------------------------------------
// SOLVE_PUZZLE
// ---------------------------------------------------------------------------
describe("solve_puzzle action", () => {
  it("solves a puzzle with correct action and items", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { result, world: newWorld } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "place_gem", itemIds: ["gem1"] },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.puzzles["puzzle1"].state).toBe("solved");
    expect(result.message).toContain("Gem Puzzle");
  });

  it("applies unlock reward when solving puzzle", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { world: newWorld, result } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "place_gem", itemIds: ["gem1"] },
      world,
      player
    );

    expect(newWorld.locks["lock1"].state).toBe("unlocked");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "lock_unlocked" })
    );
  });

  it("applies flag reward when solving puzzle", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, player: newPlayer } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle2", action: "pull_lever" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.flags["lever_pulled"]).toBe(true);
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "flag_set" })
    );
  });

  it("applies item reward when solving puzzle", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const { result, player: newPlayer } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle3", action: "search" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.inventory).toContain("potion");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "item_rewarded" })
    );
  });

  it("applies npc_state reward when solving puzzle", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, world: newWorld } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle4", action: "bribe" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.npcs["guard1"].state).toBe("friendly");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "npc_state_changed" })
    );
  });

  it("fails when puzzle does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "solve_puzzle", puzzleId: "nonexistent", action: "whatever" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when puzzle is already solved", () => {
    const world = createTestWorld();
    world.puzzles["puzzle1"].state = "solved";
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { result } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "place_gem" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("already been solved");
  });

  it("fails when player is in wrong room", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2", inventory: ["gem1"] });
    const { result } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "place_gem" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("not in the right room");
  });

  it("fails when action does not match solution", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["gem1"] });
    const { result } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "wrong_action" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("doesn't seem to work");
  });

  it("fails when required items are missing", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "place_gem" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("need");
  });
});

// ---------------------------------------------------------------------------
// TALK_NPC
// ---------------------------------------------------------------------------
describe("talk_npc action", () => {
  it("returns dialogue for the NPC's current state", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "talk_npc", npcId: "guard1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Go away!");
  });

  it("returns updated dialogue after state change", () => {
    const world = createTestWorld();
    world.npcs["guard1"].state = "friendly";
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "talk_npc", npcId: "guard1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Welcome, friend!");
  });

  it("fails when NPC does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "talk_npc", npcId: "nonexistent" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when NPC is not in the current room", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const { result } = applyAction(
      { type: "talk_npc", npcId: "guard1" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("no one by that name");
  });

  it("returns fallback dialogue for unknown state", () => {
    const world = createTestWorld();
    world.npcs["guard1"].state = "unknown_state";
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "talk_npc", npcId: "guard1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("...");
  });
});

// ---------------------------------------------------------------------------
// NPC_STATE_CHANGE
// ---------------------------------------------------------------------------
describe("npc_state_change action", () => {
  it("changes NPC state", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, world: newWorld } = applyAction(
      { type: "npc_state_change", npcId: "guard1", newState: "friendly" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.npcs["guard1"].state).toBe("friendly");
    expect(result.stateChanges).toContainEqual(
      expect.objectContaining({ type: "npc_state_changed" })
    );
  });

  it("fails when NPC does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "npc_state_change", npcId: "nonexistent", newState: "friendly" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when NPC is not in current room", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const { result } = applyAction(
      { type: "npc_state_change", npcId: "guard1", newState: "friendly" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("records old state in stateChanges", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "npc_state_change", npcId: "guard1", newState: "friendly" },
      world,
      player
    );

    const change = result.stateChanges.find(
      (sc) => sc.type === "npc_state_changed"
    );
    expect(change?.details.oldState).toBe("hostile");
    expect(change?.details.newState).toBe("friendly");
  });
});

// ---------------------------------------------------------------------------
// SET_FLAG
// ---------------------------------------------------------------------------
describe("set_flag action", () => {
  it("sets a flag to true", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, player: newPlayer } = applyAction(
      { type: "set_flag", flag: "quest_started", value: true },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.flags["quest_started"]).toBe(true);
  });

  it("sets a flag to false", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ flags: { quest_started: true } });
    const { result, player: newPlayer } = applyAction(
      { type: "set_flag", flag: "quest_started", value: false },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newPlayer.flags["quest_started"]).toBe(false);
  });

  it("always succeeds", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "set_flag", flag: "anything", value: true },
      world,
      player
    );

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REVEAL_CONNECTION
// ---------------------------------------------------------------------------
describe("reveal_connection action", () => {
  it("reveals a hidden connection", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, world: newWorld } = applyAction(
      { type: "reveal_connection", fromRoomId: "room1", toRoomId: "room3" },
      world,
      player
    );

    expect(result.success).toBe(true);
    const conn = newWorld.connections.find(
      (c) => c.fromRoomId === "room1" && c.toRoomId === "room3"
    );
    expect(conn?.hidden).toBe(false);
    expect(result.message).toContain("revealed");
  });

  it("works with reversed room IDs", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "reveal_connection", fromRoomId: "room3", toRoomId: "room1" },
      world,
      player
    );

    expect(result.success).toBe(true);
  });

  it("fails when connection does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "reveal_connection", fromRoomId: "room1", toRoomId: "room4" },
      world,
      player
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("No such connection");
  });
});

// ---------------------------------------------------------------------------
// ADD_ITEM_TO_ROOM
// ---------------------------------------------------------------------------
describe("add_item_to_room action", () => {
  it("adds an item to a room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, world: newWorld } = applyAction(
      { type: "add_item_to_room", itemId: "potion", roomId: "room2" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.rooms["room2"].itemIds).toContain("potion");
  });

  it("fails when item does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "add_item_to_room", itemId: "nonexistent", roomId: "room1" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when room does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "add_item_to_room", itemId: "potion", roomId: "nonexistent" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REMOVE_ITEM_FROM_ROOM
// ---------------------------------------------------------------------------
describe("remove_item_from_room action", () => {
  it("removes an item from a room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result, world: newWorld } = applyAction(
      { type: "remove_item_from_room", itemId: "key1", roomId: "room1" },
      world,
      player
    );

    expect(result.success).toBe(true);
    expect(newWorld.rooms["room1"].itemIds).not.toContain("key1");
  });

  it("fails when item is not in the room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "remove_item_from_room", itemId: "potion", roomId: "room1" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when item does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "remove_item_from_room", itemId: "nonexistent", roomId: "room1" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });

  it("fails when room does not exist", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const { result } = applyAction(
      { type: "remove_item_from_room", itemId: "key1", roomId: "nonexistent" },
      world,
      player
    );

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IMMUTABILITY
// ---------------------------------------------------------------------------
describe("immutability", () => {
  it("does not mutate the original player state", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const originalRoomId = player.currentRoomId;
    const originalInventory = [...player.inventory];

    applyAction({ type: "move", direction: "north" }, world, player);

    expect(player.currentRoomId).toBe(originalRoomId);
    expect(player.inventory).toEqual(originalInventory);
  });

  it("does not mutate the original world state", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ inventory: ["key1"] });
    const originalLockState = world.locks["lock1"].state;

    applyAction(
      { type: "use_item", itemId: "key1", targetId: "lock1" },
      world,
      player
    );

    expect(world.locks["lock1"].state).toBe(originalLockState);
  });

  it("does not mutate room itemIds on pickup", () => {
    const world = createTestWorld();
    const originalItems = [...world.rooms["room1"].itemIds];
    const player = createTestPlayer();

    applyAction({ type: "pickup", itemId: "key1" }, world, player);

    expect(world.rooms["room1"].itemIds).toEqual(originalItems);
  });
});

// ---------------------------------------------------------------------------
// WIN CONDITION
// ---------------------------------------------------------------------------
describe("checkWinCondition", () => {
  it("returns true when player reaches target room", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room4" });

    expect(checkWinCondition(world, player)).toBe(true);
  });

  it("returns false when player has not reached target room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();

    expect(checkWinCondition(world, player)).toBe(false);
  });

  it("handles collect_items win condition - all items collected", () => {
    const world = createTestWorld({
      winCondition: {
        type: "collect_items",
        targetId: "key1,gem1",
        description: "Collect all gems.",
      },
    });
    const player = createTestPlayer({ inventory: ["key1", "gem1"] });

    expect(checkWinCondition(world, player)).toBe(true);
  });

  it("handles collect_items win condition - missing items", () => {
    const world = createTestWorld({
      winCondition: {
        type: "collect_items",
        targetId: "key1,gem1",
        description: "Collect all gems.",
      },
    });
    const player = createTestPlayer({ inventory: ["key1"] });

    expect(checkWinCondition(world, player)).toBe(false);
  });

  it("handles solve_puzzle win condition - solved", () => {
    const world = createTestWorld({
      winCondition: {
        type: "solve_puzzle",
        targetId: "puzzle1",
        description: "Solve the gem puzzle.",
      },
    });
    world.puzzles["puzzle1"].state = "solved";
    const player = createTestPlayer();

    expect(checkWinCondition(world, player)).toBe(true);
  });

  it("handles solve_puzzle win condition - unsolved", () => {
    const world = createTestWorld({
      winCondition: {
        type: "solve_puzzle",
        targetId: "puzzle1",
        description: "Solve the gem puzzle.",
      },
    });
    const player = createTestPlayer();

    expect(checkWinCondition(world, player)).toBe(false);
  });

  it("handles flag win condition - flag set", () => {
    const world = createTestWorld({
      winCondition: {
        type: "flag",
        targetId: "victory",
        description: "Achieve victory.",
      },
    });
    const player = createTestPlayer({ flags: { victory: true } });

    expect(checkWinCondition(world, player)).toBe(true);
  });

  it("handles flag win condition - flag not set", () => {
    const world = createTestWorld({
      winCondition: {
        type: "flag",
        targetId: "victory",
        description: "Achieve victory.",
      },
    });
    const player = createTestPlayer();

    expect(checkWinCondition(world, player)).toBe(false);
  });

  it("handles flag win condition - flag is false", () => {
    const world = createTestWorld({
      winCondition: {
        type: "flag",
        targetId: "victory",
        description: "Achieve victory.",
      },
    });
    const player = createTestPlayer({ flags: { victory: false } });

    expect(checkWinCondition(world, player)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET AVAILABLE EXITS
// ---------------------------------------------------------------------------
describe("getAvailableExits", () => {
  it("returns all exits from the current room", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const exits = getAvailableExits(world, player);

    expect(exits.length).toBe(2); // north to room2, east to room3 (hidden)
    expect(exits).toContainEqual(
      expect.objectContaining({
        direction: "north",
        roomName: "Second Room",
        locked: false,
        hidden: false,
      })
    );
  });

  it("marks locked exits", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const exits = getAvailableExits(world, player);

    const northExit = exits.find((e) => e.direction === "north");
    expect(northExit?.locked).toBe(true);
  });

  it("marks hidden exits", () => {
    const world = createTestWorld();
    const player = createTestPlayer();
    const exits = getAvailableExits(world, player);

    const eastExit = exits.find((e) => e.direction === "east");
    expect(eastExit?.hidden).toBe(true);
  });

  it("shows unlocked exits after unlocking", () => {
    const world = createTestWorld();
    world.locks["lock1"].state = "unlocked";
    const player = createTestPlayer({ currentRoomId: "room2" });
    const exits = getAvailableExits(world, player);

    const northExit = exits.find((e) => e.direction === "north");
    expect(northExit?.locked).toBe(false);
  });

  it("returns empty array for room with no connections", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room4" });
    // room4 only has a connection via room2→room4 (reverse: south)
    const exits = getAvailableExits(world, player);

    expect(exits).toContainEqual(
      expect.objectContaining({ direction: "south", roomName: "Second Room" })
    );
  });

  it("includes reverse-direction exits", () => {
    const world = createTestWorld();
    const player = createTestPlayer({ currentRoomId: "room2" });
    const exits = getAvailableExits(world, player);

    expect(exits).toContainEqual(
      expect.objectContaining({ direction: "south", roomName: "Starting Room" })
    );
  });
});

// ---------------------------------------------------------------------------
// EDGE CASES / INTEGRATION
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  it("handles multi-step scenario: pickup key, unlock door, move through", () => {
    const world = createTestWorld();
    let player = createTestPlayer();

    // Step 1: Pick up the key
    const step1 = applyAction({ type: "pickup", itemId: "key1" }, world, player);
    expect(step1.result.success).toBe(true);
    player = step1.player;
    const world1 = step1.world;

    // Step 2: Move north
    const step2 = applyAction({ type: "move", direction: "north" }, world1, player);
    expect(step2.result.success).toBe(true);
    player = step2.player;
    const world2 = step2.world;

    // Step 3: Unlock the door
    const step3 = applyAction({ type: "unlock", lockId: "lock1" }, world2, player);
    expect(step3.result.success).toBe(true);
    player = step3.player;
    const world3 = step3.world;

    // Step 4: Move north through unlocked door
    const step4 = applyAction({ type: "move", direction: "north" }, world3, player);
    expect(step4.result.success).toBe(true);
    player = step4.player;
    const world4 = step4.world;

    expect(player.currentRoomId).toBe("room4");
    expect(checkWinCondition(world4, player)).toBe(true);
  });

  it("handles solving puzzle to unlock a door", () => {
    const world = createTestWorld();
    let player = createTestPlayer({ inventory: ["gem1"] });

    // Solve puzzle to unlock lock1
    const step1 = applyAction(
      { type: "solve_puzzle", puzzleId: "puzzle1", action: "place_gem", itemIds: ["gem1"] },
      world,
      player
    );
    expect(step1.result.success).toBe(true);
    player = step1.player;
    const world1 = step1.world;
    expect(world1.locks["lock1"].state).toBe("unlocked");

    // Now move through
    const step2 = applyAction({ type: "move", direction: "north" }, world1, player);
    player = step2.player;
    const world2 = step2.world;

    const step3 = applyAction({ type: "move", direction: "north" }, world2, player);
    expect(step3.result.success).toBe(true);
    expect(step3.player.currentRoomId).toBe("room4");
  });

  it("reveal hidden passage then traverse it", () => {
    const world = createTestWorld();
    let player = createTestPlayer();

    // Reveal the connection
    const step1 = applyAction(
      { type: "reveal_connection", fromRoomId: "room1", toRoomId: "room3" },
      world,
      player
    );
    expect(step1.result.success).toBe(true);
    player = step1.player;
    const world1 = step1.world;

    // Now move east
    const step2 = applyAction({ type: "move", direction: "east" }, world1, player);
    expect(step2.result.success).toBe(true);
    expect(step2.player.currentRoomId).toBe("room3");
  });

  it("turnCount increments correctly across multiple actions", () => {
    const world = createTestWorld();
    let player = createTestPlayer();

    const s1 = applyAction({ type: "pickup", itemId: "key1" }, world, player);
    player = s1.player;

    const s2 = applyAction({ type: "move", direction: "north" }, s1.world, player);
    player = s2.player;

    const s3 = applyAction({ type: "set_flag", flag: "test", value: true }, s2.world, player);
    player = s3.player;

    expect(player.turnCount).toBe(3);
    expect(player.stateVersion).toBe(3);
  });
});
