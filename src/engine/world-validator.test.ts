import { describe, it, expect } from "vitest";
import { validateWorld } from "./world-validator";
import type { GameWorld } from "@/types";

/** Minimal valid world: 3 rooms connected linearly with single bidirectional edges. */
function makeValidWorld(): GameWorld {
  return {
    startRoomId: "room-1",
    rooms: {
      "room-1": {
        id: "room-1",
        name: "Entrance Hall",
        description: "A grand entrance.",
        itemIds: ["key-1"],
        npcIds: ["npc-1"],
      },
      "room-2": {
        id: "room-2",
        name: "Library",
        description: "Shelves of dusty books.",
        itemIds: ["book-1"],
        npcIds: [],
      },
      "room-3": {
        id: "room-3",
        name: "Vault",
        description: "A locked vault.",
        itemIds: [],
        npcIds: [],
      },
    },
    items: {
      "key-1": {
        id: "key-1",
        name: "Iron Key",
        description: "A rusty iron key.",
        portable: true,
        properties: {},
      },
      "book-1": {
        id: "book-1",
        name: "Ancient Book",
        description: "A mysterious book.",
        portable: true,
        usableWith: ["npc-1"],
        properties: {},
      },
    },
    npcs: {
      "npc-1": {
        id: "npc-1",
        name: "Old Wizard",
        description: "A wise old wizard.",
        dialogue: { greeting: "Hello, traveler." },
        state: "idle",
      },
    },
    connections: [
      {
        fromRoomId: "room-1",
        toRoomId: "room-2",
        direction: "north",
        reverseDirection: "south",
      },
      {
        fromRoomId: "room-2",
        toRoomId: "room-3",
        direction: "east",
        reverseDirection: "west",
        lockId: "lock-1",
      },
    ],
    puzzles: {
      "puzzle-1": {
        id: "puzzle-1",
        name: "Book Riddle",
        roomId: "room-2",
        description: "Solve the riddle in the book.",
        state: "unsolved",
        solution: {
          action: "use",
          itemIds: ["book-1"],
          npcId: "npc-1",
          description: "Use the Ancient Book while speaking to the Old Wizard.",
        },
        reward: { type: "flag", targetId: "riddle-solved" },
      },
    },
    locks: {
      "lock-1": {
        id: "lock-1",
        state: "locked",
        mechanism: "key",
        keyItemId: "key-1",
        conditionDescription: "Unlock this door with the Iron Key.",
      },
    },
    winCondition: {
      type: "reach_room",
      targetId: "room-3",
      description: "Reach the vault.",
    },
  };
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

describe("validateWorld", () => {
  // ──────────────────── VALID WORLD ────────────────────
  it("returns valid for a well-formed world", () => {
    const result = validateWorld(makeValidWorld());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ──────────────────── EMPTY_WORLD ────────────────────
  it("errors on empty world (no rooms)", () => {
    const world = clone(makeValidWorld());
    world.rooms = {};
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EMPTY_WORLD")).toBe(true);
  });

  // ──────────────────── INVALID_START_ROOM ────────────────────
  it("errors when startRoomId references a non-existent room", () => {
    const world = clone(makeValidWorld());
    world.startRoomId = "room-nonexistent";
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_START_ROOM")).toBe(
      true,
    );
  });

  // ──────────────────── DISCONNECTED_ROOM ────────────────────
  it("errors when a room is not reachable from startRoomId", () => {
    const world = clone(makeValidWorld());
    world.rooms["room-isolated"] = {
      id: "room-isolated",
      name: "Isolated Room",
      description: "Cannot reach.",
      itemIds: [],
      npcIds: [],
    };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "DISCONNECTED_ROOM");
    expect(err).toBeDefined();
    expect(err!.context?.roomId).toBe("room-isolated");
  });

  // ──────────────────── INVALID_ITEM_REF ────────────────────
  it("errors when a room references a non-existent item", () => {
    const world = clone(makeValidWorld());
    world.rooms["room-1"].itemIds.push("item-missing");
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "INVALID_ITEM_REF");
    expect(err).toBeDefined();
    expect(err!.context?.itemId).toBe("item-missing");
    expect(err!.context?.roomId).toBe("room-1");
  });

  // ──────────────────── INVALID_NPC_REF ────────────────────
  it("errors when a room references a non-existent NPC", () => {
    const world = clone(makeValidWorld());
    world.rooms["room-1"].npcIds.push("npc-missing");
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_NPC_REF")).toBe(true);
  });

  // ──────────────────── INVALID_ROOM_REF (connections) ────────────────────
  it("errors when a connection references a non-existent room (fromRoomId)", () => {
    const world = clone(makeValidWorld());
    world.connections.push({
      fromRoomId: "room-ghost",
      toRoomId: "room-1",
      direction: "up",
      reverseDirection: "down",
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_ROOM_REF")).toBe(true);
  });

  it("errors when a connection references a non-existent room (toRoomId)", () => {
    const world = clone(makeValidWorld());
    world.connections.push({
      fromRoomId: "room-1",
      toRoomId: "room-ghost",
      direction: "up",
      reverseDirection: "down",
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_ROOM_REF")).toBe(true);
  });

  // ──────────────────── INVALID_LOCK_REF ────────────────────
  it("errors when a connection references a non-existent lock", () => {
    const world = clone(makeValidWorld());
    world.connections.push({
      fromRoomId: "room-1",
      toRoomId: "room-2",
      direction: "up",
      reverseDirection: "down",
      lockId: "lock-missing",
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_LOCK_REF")).toBe(true);
  });

  // ──────────────────── INVALID_KEY_ITEM_REF ────────────────────
  it("errors when a lock references a non-existent key item", () => {
    const world = clone(makeValidWorld());
    world.locks["lock-1"].keyItemId = "item-ghost";
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_KEY_ITEM_REF")).toBe(
      true,
    );
  });

  // ──────────────────── INVALID_PUZZLE_REF ────────────────────
  it("errors when a lock references a non-existent puzzle", () => {
    const world = clone(makeValidWorld());
    world.locks["lock-puzzle"] = {
      id: "lock-puzzle",
      state: "locked",
      mechanism: "puzzle",
      puzzleId: "puzzle-ghost",
    };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_PUZZLE_REF")).toBe(
      true,
    );
  });

  // ──────────────────── INVALID_PUZZLE_ROOM_REF ────────────────────
  it("errors when a puzzle references a non-existent room", () => {
    const world = clone(makeValidWorld());
    world.puzzles["puzzle-1"].roomId = "room-ghost";
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === "INVALID_PUZZLE_ROOM_REF"),
    ).toBe(true);
  });

  // ──────────────────── INVALID_SOLUTION_ITEM_REF ────────────────────
  it("errors when a puzzle solution references a non-existent item", () => {
    const world = clone(makeValidWorld());
    world.puzzles["puzzle-1"].solution.itemIds = ["item-ghost"];
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === "INVALID_SOLUTION_ITEM_REF"),
    ).toBe(true);
  });

  // ──────────────────── INVALID_SOLUTION_NPC_REF ────────────────────
  it("errors when a puzzle solution references a non-existent NPC", () => {
    const world = clone(makeValidWorld());
    world.puzzles["puzzle-1"].solution.npcId = "npc-ghost";
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === "INVALID_SOLUTION_NPC_REF"),
    ).toBe(true);
  });

  // ──────────────────── INVALID_WIN_TARGET ────────────────────
  it("errors when win condition targets a non-existent room (reach_room)", () => {
    const world = clone(makeValidWorld());
    world.winCondition = {
      type: "reach_room",
      targetId: "room-ghost",
      description: "Reach a room that doesn't exist",
    };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_WIN_TARGET")).toBe(
      true,
    );
  });

  it("errors when win condition targets a non-existent puzzle (solve_puzzle)", () => {
    const world = clone(makeValidWorld());
    world.winCondition = {
      type: "solve_puzzle",
      targetId: "puzzle-ghost",
      description: "Solve nonexistent puzzle",
    };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_WIN_TARGET")).toBe(
      true,
    );
  });

  it("errors when win condition targets a non-existent item (collect_items)", () => {
    const world = clone(makeValidWorld());
    world.winCondition = {
      type: "collect_items",
      targetId: "item-ghost",
      description: "Collect nonexistent item",
    };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_WIN_TARGET")).toBe(
      true,
    );
  });

  it("accepts a flag win condition (no entity check)", () => {
    const world = clone(makeValidWorld());
    world.winCondition = {
      type: "flag",
      targetId: "any-flag-name",
      description: "Set the flag",
    };
    const result = validateWorld(world);
    // Flags don't reference entities, so no INVALID_WIN_TARGET
    expect(result.errors.some((e) => e.code === "INVALID_WIN_TARGET")).toBe(
      false,
    );
  });

  // ──────────────────── KEY_BEHIND_OWN_LOCK ────────────────────
  it("errors when a key is only reachable through its own lock", () => {
    const world = clone(makeValidWorld());
    // Move key-1 to room-3 (behind lock-1)
    world.rooms["room-1"].itemIds = [];
    world.rooms["room-3"].itemIds = ["key-1"];
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "KEY_BEHIND_OWN_LOCK");
    expect(err).toBeDefined();
    expect(err!.context?.lockId).toBe("lock-1");
    expect(err!.context?.keyItemId).toBe("key-1");
  });

  it("does not error when key is reachable without going through its lock", () => {
    const world = clone(makeValidWorld());
    // key-1 is in room-1 (start room), reachable without lock-1
    const result = validateWorld(world);
    expect(result.errors.some((e) => e.code === "KEY_BEHIND_OWN_LOCK")).toBe(
      false,
    );
  });

  // ──────────────────── DUPLICATE_CONNECTION ────────────────────
  it("errors when two connections go from the same room in the same direction", () => {
    const world = clone(makeValidWorld());
    world.connections.push({
      fromRoomId: "room-1",
      toRoomId: "room-3",
      direction: "north",
      reverseDirection: "south",
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.code === "DUPLICATE_CONNECTION");
    expect(err).toBeDefined();
    expect(err!.context?.fromRoomId).toBe("room-1");
    expect(err!.context?.direction).toBe("north");
  });

  // ──────────────────── DUPLICATE_MIRRORED_CONNECTION ────────────────────
  it("errors when the reverse corridor is duplicated as a second connection", () => {
    const world = clone(makeValidWorld());
    world.connections.push({
      fromRoomId: "room-2",
      toRoomId: "room-1",
      direction: "south",
      reverseDirection: "north",
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_CONNECTION")).toBe(true);
  });

  // ──────────────────── UNREACHABLE_WIN_CONDITION ────────────────────
  it("warns when the win condition target room is disconnected", () => {
    const world = clone(makeValidWorld());
    // Add an isolated room as the win target
    world.rooms["room-isolated"] = {
      id: "room-isolated",
      name: "Isolated",
      description: "Unreachable room.",
      itemIds: [],
      npcIds: [],
    };
    world.winCondition = {
      type: "reach_room",
      targetId: "room-isolated",
      description: "Reach the isolated room",
    };
    const result = validateWorld(world);
    expect(result.errors.some((e) => e.code === "UNREACHABLE_WIN_CONDITION")).toBe(true);
  });

  it("does not flag reachable win condition room", () => {
    const world = makeValidWorld();
    // room-3 is reachable, so no error
    const result = validateWorld(world);
    expect(
      result.errors.some((e) => e.code === "UNREACHABLE_WIN_CONDITION"),
    ).toBe(false);
  });

  // ──────────────────── MULTIPLE ERRORS ────────────────────
  it("collects multiple errors from one world", () => {
    const world = clone(makeValidWorld());
    world.startRoomId = "room-nonexistent";
    world.rooms["room-1"].itemIds.push("item-missing");
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  // ──────────────────── SEVERITY ────────────────────
  it("sets severity=error for errors and severity=warning for warnings", () => {
    const world = clone(makeValidWorld());
    world.connections = world.connections.filter(
      (c) => !(c.fromRoomId === "room-2" && c.direction === "south"),
    );
    const result = validateWorld(world);
    for (const e of result.errors) {
      expect(e.severity).toBe("error");
    }
    for (const w of result.warnings) {
      expect(w.severity).toBe("warning");
    }
  });

  // ──────────────────── valid=true only when no errors ────────────────────
  it("valid is true when there are no validation errors", () => {
    const result = validateWorld(makeValidWorld());
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});
