import { describe, it, expect } from "vitest";
import { buildLocalContext } from "./context-builder";
import type {
  GameWorld,
  PlayerState,
  TurnEntry,
  Room,
  Item,
  NPC,
  Connection,
  Puzzle,
  Lock,
} from "@/types";

function makeTestWorld(): GameWorld {
  const rooms: Record<string, Room> = {
    entrance: {
      id: "entrance",
      name: "Entrance Hall",
      description: "A grand entrance hall.",
      itemIds: ["key", "torch"],
      npcIds: ["guard"],
      firstVisitText: "You step into the entrance hall for the first time.",
    },
    library: {
      id: "library",
      name: "Library",
      description: "Dusty shelves filled with books.",
      itemIds: ["book"],
      npcIds: ["librarian"],
    },
    dungeon: {
      id: "dungeon",
      name: "Dungeon",
      description: "A dark and damp dungeon.",
      itemIds: [],
      npcIds: [],
    },
    tower: {
      id: "tower",
      name: "Tower",
      description: "A tall tower room.",
      itemIds: ["gem"],
      npcIds: [],
    },
  };

  const items: Record<string, Item> = {
    key: {
      id: "key",
      name: "Rusty Key",
      description: "An old rusty key.",
      portable: true,
      properties: {},
    },
    torch: {
      id: "torch",
      name: "Torch",
      description: "A burning torch.",
      portable: true,
      properties: { lit: true },
    },
    book: {
      id: "book",
      name: "Ancient Book",
      description: "A book of spells.",
      portable: true,
      usableWith: ["bookshelf"],
      properties: {},
    },
    gem: {
      id: "gem",
      name: "Ruby Gem",
      description: "A glowing ruby.",
      portable: true,
      properties: { value: 100 },
    },
    sword: {
      id: "sword",
      name: "Sword",
      description: "A sharp blade.",
      portable: true,
      properties: {},
    },
  };

  const npcs: Record<string, NPC> = {
    guard: {
      id: "guard",
      name: "Castle Guard",
      description: "A stern guard.",
      dialogue: { greeting: "Halt! Who goes there?" },
      state: "idle",
    },
    librarian: {
      id: "librarian",
      name: "Old Librarian",
      description: "A wise old librarian.",
      dialogue: { greeting: "Welcome, seeker of knowledge." },
      state: "friendly",
    },
  };

  const connections: Connection[] = [
    {
      fromRoomId: "entrance",
      toRoomId: "library",
      direction: "north",
      reverseDirection: "south",
    },
    {
      fromRoomId: "entrance",
      toRoomId: "dungeon",
      direction: "east",
      reverseDirection: "west",
      lockId: "dungeon-lock",
    },
    {
      fromRoomId: "library",
      toRoomId: "tower",
      direction: "up",
      reverseDirection: "down",
      hidden: true,
    },
    {
      fromRoomId: "entrance",
      toRoomId: "tower",
      direction: "west",
      reverseDirection: "east",
      hidden: false,
      description: "A revealed secret passage.",
    },
  ];

  const puzzles: Record<string, Puzzle> = {
    "riddle-puzzle": {
      id: "riddle-puzzle",
      name: "Guard's Riddle",
      roomId: "entrance",
      description: "Solve the guard's riddle.",
      state: "unsolved",
      solution: { action: "answer", npcId: "guard" },
      reward: { type: "unlock", targetId: "dungeon-lock" },
    },
    "library-puzzle": {
      id: "library-puzzle",
      name: "Book Cipher",
      roomId: "library",
      description: "Decode the book cipher.",
      state: "unsolved",
      solution: { action: "decode", itemIds: ["book"] },
      reward: { type: "flag", targetId: "cipher_solved" },
    },
    "solved-puzzle": {
      id: "solved-puzzle",
      name: "Already Solved",
      roomId: "entrance",
      description: "This puzzle is already done.",
      state: "solved",
      solution: { action: "open" },
      reward: { type: "item", targetId: "gem" },
    },
  };

  const locks: Record<string, Lock> = {
    "dungeon-lock": {
      id: "dungeon-lock",
      state: "locked",
      mechanism: "key",
      keyItemId: "key",
    },
  };

  return {
    rooms,
    items,
    npcs,
    connections,
    puzzles,
    locks,
    winCondition: {
      type: "collect_items",
      targetId: "gem",
      description: "Collect the ruby gem to win.",
    },
    startRoomId: "entrance",
  };
}

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    currentRoomId: "entrance",
    inventory: [],
    visitedRooms: [],
    flags: {},
    turnCount: 0,
    stateVersion: 1,
    ...overrides,
  };
}

function makeHistory(count: number): TurnEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    turnId: `turn-${i}`,
    role: i % 2 === 0 ? ("player" as const) : ("narrator" as const),
    text: `Turn ${i} text`,
    timestamp: 1000 + i,
  }));
}

describe("buildLocalContext", () => {
  describe("currentRoom", () => {
    it("returns the room the player is in", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);
      expect(ctx.currentRoom).toEqual(world.rooms["entrance"]);
    });

    it("throws if current room does not exist in world", () => {
      const world = makeTestWorld();
      const player = makePlayer({ currentRoomId: "nonexistent" });
      expect(() => buildLocalContext(world, player, [])).toThrow();
    });
  });

  describe("nearbyRooms", () => {
    it("returns non-hidden connections with resolved rooms", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      const directions = ctx.nearbyRooms.map((r) => r.direction);
      expect(directions).toContain("north");
      expect(directions).toContain("east");
      // hidden===false means revealed, should be included
      expect(directions).toContain("west");
    });

    it("excludes hidden connections (hidden === true)", () => {
      const world = makeTestWorld();
      // Player is in library — tower connection is hidden
      const player = makePlayer({ currentRoomId: "library" });
      const ctx = buildLocalContext(world, player, []);

      const directions = ctx.nearbyRooms.map((r) => r.direction);
      // south goes back to entrance (reverse of entrance→library north)
      expect(directions).toContain("south");
      // up to tower is hidden, should NOT appear
      expect(directions).not.toContain("up");
    });

    it("includes revealed connections (hidden === false)", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      const westRoom = ctx.nearbyRooms.find((r) => r.direction === "west");
      expect(westRoom).toBeDefined();
      expect(westRoom!.room.id).toBe("tower");
      expect(westRoom!.hidden).toBe(false);
    });

    it("includes locked status from locks", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      const eastRoom = ctx.nearbyRooms.find((r) => r.direction === "east");
      expect(eastRoom).toBeDefined();
      expect(eastRoom!.locked).toBe(true);
      expect(eastRoom!.room.id).toBe("dungeon");
    });

    it("returns empty array when room has no connections", () => {
      const world = makeTestWorld();
      // Remove all connections from dungeon by moving player there
      // Dungeon has east connection back to entrance via reverse
      world.connections = [];
      const player = makePlayer({ currentRoomId: "dungeon" });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.nearbyRooms).toEqual([]);
    });

    it("resolves reverse direction connections", () => {
      const world = makeTestWorld();
      // Dungeon connects to entrance via reverse direction "west"
      const player = makePlayer({ currentRoomId: "dungeon" });
      const ctx = buildLocalContext(world, player, []);

      const westRoom = ctx.nearbyRooms.find((r) => r.direction === "west");
      expect(westRoom).toBeDefined();
      expect(westRoom!.room.id).toBe("entrance");
    });
  });

  describe("inventoryItems", () => {
    it("resolves inventory item IDs to full Item objects", () => {
      const world = makeTestWorld();
      const player = makePlayer({ inventory: ["sword", "key"] });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.inventoryItems).toHaveLength(2);
      expect(ctx.inventoryItems.map((i) => i.id)).toContain("sword");
      expect(ctx.inventoryItems.map((i) => i.id)).toContain("key");
    });

    it("skips missing inventory items gracefully", () => {
      const world = makeTestWorld();
      const player = makePlayer({ inventory: ["sword", "nonexistent"] });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.inventoryItems).toHaveLength(1);
      expect(ctx.inventoryItems[0].id).toBe("sword");
    });

    it("returns empty array for empty inventory", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.inventoryItems).toEqual([]);
    });
  });

  describe("roomItems", () => {
    it("resolves room item IDs to full Item objects", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.roomItems).toHaveLength(2);
      const ids = ctx.roomItems.map((i) => i.id);
      expect(ids).toContain("key");
      expect(ids).toContain("torch");
    });

    it("skips missing room items gracefully", () => {
      const world = makeTestWorld();
      world.rooms["entrance"].itemIds.push("missing-item");
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      // Still returns key and torch, skips missing
      expect(ctx.roomItems).toHaveLength(2);
    });

    it("returns empty array for room with no items", () => {
      const world = makeTestWorld();
      const player = makePlayer({ currentRoomId: "dungeon" });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.roomItems).toEqual([]);
    });
  });

  describe("roomNPCs", () => {
    it("resolves NPC IDs from current room to full NPC objects", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.roomNPCs).toHaveLength(1);
      expect(ctx.roomNPCs[0].id).toBe("guard");
    });

    it("skips missing NPC references gracefully", () => {
      const world = makeTestWorld();
      world.rooms["entrance"].npcIds.push("ghost");
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.roomNPCs).toHaveLength(1);
      expect(ctx.roomNPCs[0].id).toBe("guard");
    });

    it("returns empty array for room with no NPCs", () => {
      const world = makeTestWorld();
      const player = makePlayer({ currentRoomId: "dungeon" });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.roomNPCs).toEqual([]);
    });
  });

  describe("activePuzzles", () => {
    it("returns unsolved puzzles in the current room", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.activePuzzles).toHaveLength(1);
      expect(ctx.activePuzzles[0].id).toBe("riddle-puzzle");
    });

    it("excludes solved puzzles", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      const ids = ctx.activePuzzles.map((p) => p.id);
      expect(ids).not.toContain("solved-puzzle");
    });

    it("excludes puzzles from other rooms", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      const ids = ctx.activePuzzles.map((p) => p.id);
      expect(ids).not.toContain("library-puzzle");
    });
  });

  describe("relevantLocks", () => {
    it("returns locks on connections from the current room", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.relevantLocks).toHaveLength(1);
      expect(ctx.relevantLocks[0].id).toBe("dungeon-lock");
    });

    it("returns empty when no connections have locks", () => {
      const world = makeTestWorld();
      const player = makePlayer({ currentRoomId: "library" });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.relevantLocks).toEqual([]);
    });
  });

  describe("recentHistory", () => {
    it("returns the last N entries from history (default 10)", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const history = makeHistory(15);
      const ctx = buildLocalContext(world, player, history);

      expect(ctx.recentHistory).toHaveLength(10);
      expect(ctx.recentHistory[0].turnId).toBe("turn-5");
      expect(ctx.recentHistory[9].turnId).toBe("turn-14");
    });

    it("returns all entries when history is shorter than limit", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const history = makeHistory(3);
      const ctx = buildLocalContext(world, player, history);

      expect(ctx.recentHistory).toHaveLength(3);
    });

    it("returns empty array for empty history", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.recentHistory).toEqual([]);
    });

    it("respects custom historyLimit", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const history = makeHistory(20);
      const ctx = buildLocalContext(world, player, history, 5);

      expect(ctx.recentHistory).toHaveLength(5);
      expect(ctx.recentHistory[0].turnId).toBe("turn-15");
    });
  });

  describe("playerFlags", () => {
    it("copies player flags directly", () => {
      const world = makeTestWorld();
      const flags = { door_opened: true, npc_met: false };
      const player = makePlayer({ flags });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.playerFlags).toEqual(flags);
    });

    it("returns empty object when no flags", () => {
      const world = makeTestWorld();
      const player = makePlayer();
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.playerFlags).toEqual({});
    });
  });

  describe("isFirstVisit", () => {
    it("returns true when room has not been visited", () => {
      const world = makeTestWorld();
      const player = makePlayer({ visitedRooms: [] });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.isFirstVisit).toBe(true);
    });

    it("returns false when room has been visited before", () => {
      const world = makeTestWorld();
      const player = makePlayer({ visitedRooms: ["entrance"] });
      const ctx = buildLocalContext(world, player, []);

      expect(ctx.isFirstVisit).toBe(false);
    });
  });

  describe("integration", () => {
    it("builds full context for player in library with inventory", () => {
      const world = makeTestWorld();
      const player = makePlayer({
        currentRoomId: "library",
        inventory: ["sword"],
        visitedRooms: ["entrance", "library"],
        flags: { intro_seen: true },
      });
      const history = makeHistory(3);
      const ctx = buildLocalContext(world, player, history);

      expect(ctx.currentRoom.id).toBe("library");
      expect(ctx.inventoryItems).toHaveLength(1);
      expect(ctx.inventoryItems[0].id).toBe("sword");
      expect(ctx.roomItems).toHaveLength(1);
      expect(ctx.roomItems[0].id).toBe("book");
      expect(ctx.roomNPCs).toHaveLength(1);
      expect(ctx.roomNPCs[0].id).toBe("librarian");
      expect(ctx.activePuzzles).toHaveLength(1);
      expect(ctx.activePuzzles[0].id).toBe("library-puzzle");
      expect(ctx.relevantLocks).toEqual([]);
      expect(ctx.recentHistory).toHaveLength(3);
      expect(ctx.playerFlags).toEqual({ intro_seen: true });
      expect(ctx.isFirstVisit).toBe(false);
    });
  });
});
