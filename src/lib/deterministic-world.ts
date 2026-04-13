import type {
  Connection,
  Direction,
  GameGenerationRequest,
  GameWorld,
  Interactable,
  Item,
  Lock,
  NPC,
  Puzzle,
  Room,
} from "@/types";

const CARDINAL_DIRECTIONS = [
  "north",
  "east",
  "south",
  "west",
] as const satisfies Direction[];

const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
};

const SIZE_CONFIG: Record<
  GameGenerationRequest["size"],
  { rooms: number; branches: number; loreItems: number; guideNpcs: number }
> = {
  small: { rooms: 6, branches: 1, loreItems: 1, guideNpcs: 1 },
  medium: { rooms: 9, branches: 2, loreItems: 2, guideNpcs: 2 },
  large: { rooms: 14, branches: 4, loreItems: 3, guideNpcs: 3 },
  epic: { rooms: 20, branches: 6, loreItems: 4, guideNpcs: 4 },
};

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 0x12345678;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function getCoordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function getDirectionOffset(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "north":
      return { x: 0, y: -1 };
    case "south":
      return { x: 0, y: 1 };
    case "east":
      return { x: 1, y: 0 };
    case "west":
      return { x: -1, y: 0 };
    case "up":
    case "down":
      return { x: 0, y: 0 };
  }
}

function listUnusedDirections(
  usedDirections: Set<Direction>,
  rng: () => number,
): Direction[] {
  return shuffle(
    CARDINAL_DIRECTIONS.filter((direction) => !usedDirections.has(direction)),
    rng,
  );
}

function findOpenCoordinate(
  origin: { x: number; y: number },
  directions: readonly Direction[],
  occupied: Set<string>,
  maxDistance = 32,
): { direction: Direction; coordinate: { x: number; y: number } } | null {
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    for (const direction of directions) {
      const offset = getDirectionOffset(direction);
      const coordinate = {
        x: origin.x + offset.x * distance,
        y: origin.y + offset.y * distance,
      };

      if (!occupied.has(getCoordinateKey(coordinate.x, coordinate.y))) {
        return { direction, coordinate };
      }
    }
  }

  return null;
}

function addConnection(
  connections: Connection[],
  usedDirections: Map<string, Set<Direction>>,
  fromRoomId: string,
  toRoomId: string,
  direction: Direction,
  lockId?: string,
): void {
  const reverseDirection = OPPOSITE_DIRECTION[direction];

  const fromDirections = usedDirections.get(fromRoomId) ?? new Set<Direction>();
  const toDirections = usedDirections.get(toRoomId) ?? new Set<Direction>();

  fromDirections.add(direction);
  toDirections.add(reverseDirection);
  usedDirections.set(fromRoomId, fromDirections);
  usedDirections.set(toRoomId, toDirections);

  connections.push({
    fromRoomId,
    toRoomId,
    direction,
    reverseDirection,
    ...(lockId ? { lockId } : {}),
  });
}

function createPlaceholderRoom(roomId: string, index: number): Room {
  return {
    id: roomId,
    name: `Room ${index + 1}`,
    description: `Placeholder room ${index + 1} awaiting AI-authored content.`,
    itemIds: [],
    npcIds: [],
    ...(index === 0
      ? {
          firstVisitText:
            "Placeholder opening narration awaiting AI-authored content.",
        }
      : {}),
  };
}

function createPlacementOrder(
  roomIds: string[],
  mainRoomCount: number,
): string[] {
  const branchRooms = roomIds.slice(mainRoomCount);
  const mainSupportRooms = roomIds.slice(1, Math.max(2, mainRoomCount - 1));
  return [...branchRooms, ...mainSupportRooms];
}

function createLoreItem(itemId: string, index: number): Item {
  return {
    id: itemId,
    name: `Lore Item ${index + 1}`,
    description: `Placeholder lore item ${index + 1} awaiting AI-authored content.`,
    portable: true,
    properties: {
      role: "lore",
      slot: index + 1,
    },
  };
}

function createGuideNpc(npcId: string, index: number): NPC {
  return {
    id: npcId,
    name: `Guide NPC ${index + 1}`,
    description: `Placeholder guide NPC ${index + 1} awaiting AI-authored content.`,
    dialogue: {
      greeting: `Placeholder greeting for ${npcId}.`,
    },
    state: "waiting",
  };
}

function placeRoomEntity(
  rooms: Record<string, Room>,
  roomId: string,
  kind: "item" | "npc",
  entityId: string,
): void {
  if (kind === "item") {
    rooms[roomId].itemIds.push(entityId);
    return;
  }

  rooms[roomId].npcIds.push(entityId);
}

export function buildDeterministicWorld(
  request: GameGenerationRequest,
  seed: string,
): GameWorld {
  const rng = createRng(`${seed}:${request.size}`);
  const config = SIZE_CONFIG[request.size];

  const rooms: Record<string, Room> = {};
  const items: Record<string, Item> = {};
  const npcs: Record<string, NPC> = {};
  const interactables: Record<string, Interactable> = {};
  const puzzles: Record<string, Puzzle> = {};
  const locks: Record<string, Lock> = {};
  const connections: Connection[] = [];
  const usedDirections = new Map<string, Set<Direction>>();
  const roomCoordinates = new Map<string, { x: number; y: number }>();
  const occupied = new Set<string>();

  const roomIds = Array.from(
    { length: config.rooms },
    (_, index) => `room-${index + 1}`,
  );
  const branchCount = Math.min(config.branches, Math.max(1, config.rooms - 4));
  const mainRoomCount = config.rooms - branchCount;

  for (let index = 0; index < roomIds.length; index += 1) {
    rooms[roomIds[index]] = createPlaceholderRoom(roomIds[index], index);
  }

  const startRoomId = roomIds[0];
  roomCoordinates.set(startRoomId, { x: 0, y: 0 });
  occupied.add(getCoordinateKey(0, 0));

  for (let index = 0; index < mainRoomCount - 1; index += 1) {
    const currentRoomId = roomIds[index];
    const nextRoomId = roomIds[index + 1];
    const currentCoordinate = roomCoordinates.get(currentRoomId)!;
    const currentUsedDirections =
      usedDirections.get(currentRoomId) ?? new Set<Direction>();
    const placement = findOpenCoordinate(
      currentCoordinate,
      listUnusedDirections(currentUsedDirections, rng),
      occupied,
    );

    if (!placement) {
      throw new Error(`Unable to place main-path room from ${currentRoomId}.`);
    }

    roomCoordinates.set(nextRoomId, placement.coordinate);
    occupied.add(
      getCoordinateKey(placement.coordinate.x, placement.coordinate.y),
    );
    addConnection(
      connections,
      usedDirections,
      currentRoomId,
      nextRoomId,
      placement.direction,
    );
  }

  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const branchRoomId = roomIds[mainRoomCount + branchIndex];
    let attached = false;

    for (const parentRoomId of shuffle(roomIds.slice(1, mainRoomCount - 1), rng)) {
      const parentCoordinate = roomCoordinates.get(parentRoomId);
      if (!parentCoordinate) {
        continue;
      }

      const placement = findOpenCoordinate(
        parentCoordinate,
        listUnusedDirections(
          usedDirections.get(parentRoomId) ?? new Set<Direction>(),
          rng,
        ),
        occupied,
      );

      if (!placement) {
        continue;
      }

      roomCoordinates.set(branchRoomId, placement.coordinate);
      occupied.add(
        getCoordinateKey(placement.coordinate.x, placement.coordinate.y),
      );
      addConnection(
        connections,
        usedDirections,
        parentRoomId,
        branchRoomId,
        placement.direction,
      );
      attached = true;
      break;
    }

    if (!attached) {
      for (const fallbackParent of shuffle(roomIds.slice(0, mainRoomCount), rng)) {
        const parentCoordinate = roomCoordinates.get(fallbackParent);
        if (!parentCoordinate) {
          continue;
        }

        const placement = findOpenCoordinate(
          parentCoordinate,
          listUnusedDirections(
            usedDirections.get(fallbackParent) ?? new Set<Direction>(),
            rng,
          ),
          occupied,
          config.rooms + branchCount + 4,
        );

        if (!placement) {
          continue;
        }

        roomCoordinates.set(branchRoomId, placement.coordinate);
        occupied.add(
          getCoordinateKey(placement.coordinate.x, placement.coordinate.y),
        );
        addConnection(
          connections,
          usedDirections,
          fallbackParent,
          branchRoomId,
          placement.direction,
        );
        attached = true;
        break;
      }
    }

    if (!attached) {
      throw new Error(`Unable to attach branch room ${branchRoomId}.`);
    }
  }

  const placementOrder = createPlacementOrder(roomIds, mainRoomCount);
  const progressionRoomId = placementOrder[0] ?? roomIds[1] ?? startRoomId;
  const finalRoomId = roomIds[mainRoomCount - 1];
  const penultimateRoomId = roomIds[mainRoomCount - 2];
  const puzzleRoomId = roomIds[Math.max(2, Math.floor(mainRoomCount / 2))];

  items["progression-item-1"] = {
    id: "progression-item-1",
    name: "Progression Item 1",
    description:
      "Placeholder progression item awaiting AI-authored content.",
    portable: true,
    usableWith: ["puzzle-target-1"],
    properties: {
      role: "progression",
      required: true,
    },
  };
  placeRoomEntity(rooms, progressionRoomId, "item", "progression-item-1");

  for (let index = 0; index < config.loreItems; index += 1) {
    const itemId = `lore-item-${index + 1}`;
    items[itemId] = createLoreItem(itemId, index);
    const roomId =
      index === 0
        ? startRoomId
        : placementOrder[index] ?? roomIds[Math.min(index + 1, roomIds.length - 1)];
    placeRoomEntity(rooms, roomId, "item", itemId);
  }

  for (let index = 0; index < config.guideNpcs; index += 1) {
    const npcId = `guide-npc-${index + 1}`;
    npcs[npcId] = createGuideNpc(npcId, index);
    const roomId =
      index === 0
        ? startRoomId
        : placementOrder[index] ?? roomIds[Math.min(index + 1, roomIds.length - 1)];
    placeRoomEntity(rooms, roomId, "npc", npcId);
  }

  interactables["puzzle-target-1"] = {
    id: "puzzle-target-1",
    roomId: puzzleRoomId,
    name: "Puzzle Target 1",
    description:
      "Placeholder puzzle target awaiting AI-authored content.",
    aliases: ["puzzle target", "device", "mechanism"],
    state: "inactive",
    properties: {
      role: "progression-puzzle-target",
      criticalPath: true,
    },
  };

  interactables["final-gate-target-1"] = {
    id: "final-gate-target-1",
    roomId: penultimateRoomId,
    name: "Final Gate 1",
    description:
      "Placeholder final gate awaiting AI-authored content.",
    aliases: ["gate", "barrier", "door"],
    state: "locked",
    properties: {
      role: "final-gate",
      criticalPath: true,
    },
  };

  puzzles["progression-puzzle-1"] = {
    id: "progression-puzzle-1",
    name: "Progression Puzzle 1",
    roomId: puzzleRoomId,
    description:
      "Placeholder progression puzzle awaiting AI-authored content.",
    state: "unsolved",
    solution: {
      action: "use",
      itemIds: ["progression-item-1"],
      targetInteractableId: "puzzle-target-1",
      targetState: "stabilized",
      description:
        "Use Progression Item 1 on Puzzle Target 1 to unlock the final gate.",
    },
    reward: {
      type: "unlock",
      targetId: "final-gate-lock-1",
    },
  };

  locks["final-gate-lock-1"] = {
    id: "final-gate-lock-1",
    state: "locked",
    mechanism: "puzzle",
    puzzleId: "progression-puzzle-1",
    targetInteractableId: "final-gate-target-1",
    unlockedState: "open",
    conditionDescription:
      "Solve Progression Puzzle 1 to open Final Gate 1.",
  };

  const finalConnection = connections.find(
    (connection) =>
      (connection.fromRoomId === penultimateRoomId &&
        connection.toRoomId === finalRoomId) ||
      (connection.fromRoomId === finalRoomId &&
        connection.toRoomId === penultimateRoomId),
  );

  if (finalConnection) {
    finalConnection.lockId = "final-gate-lock-1";
  }

  return {
    rooms,
    items,
    npcs,
    interactables,
    connections,
    puzzles,
    locks,
    winCondition: {
      type: "reach_room",
      targetId: finalRoomId,
      description: `Reach ${rooms[finalRoomId].name} after opening Final Gate 1.`,
    },
    startRoomId,
  };
}
