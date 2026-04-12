import type {
  Connection,
  Direction,
  GameGenerationRequest,
  GameWorld,
  Item,
  Lock,
  NPC,
  Puzzle,
  Room,
} from "@/types";

const CARDINAL_DIRECTIONS = ["north", "east", "south", "west"] as const satisfies Direction[];

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
  { rooms: number; branches: number }
> = {
  small: { rooms: 6, branches: 1 },
  medium: { rooms: 9, branches: 2 },
  large: { rooms: 14, branches: 4 },
  epic: { rooms: 20, branches: 6 },
};

const ROOM_NAME_POOLS = {
  station: [
    "Docking Ring",
    "Arrival Concourse",
    "Maintenance Spine",
    "Life Support Hub",
    "Observation Gallery",
    "Cargo Annex",
    "Comms Relay",
    "Engine Junction",
    "Command Bridge",
    "Service Crawl",
    "Hydroponics Bay",
    "Customs Office",
    "Archive Vault",
    "Mediation Booth",
    "Power Regulator",
    "Habitat Strip",
    "Supply Lockers",
    "Transit Hub",
    "Thermal Exchange",
    "Emergency Airlock",
    "Signal Loft",
    "Dockmaster Nook",
    "Orbital Pantry",
    "Inspection Deck",
  ],
  ship: [
    "Airlock",
    "Main Corridor",
    "Galley",
    "Crew Quarters",
    "Engine Room",
    "Sensor Deck",
    "Cargo Bay",
    "Auxiliary Bridge",
    "Medical Alcove",
    "Shield Control",
    "Navigation Pit",
    "Maintenance Locker",
    "Communications Mast",
    "Drone Berth",
    "Observation Blister",
    "Fuel Gallery",
    "Chart Room",
    "Captain's Office",
    "Scrubber Access",
    "Spare Parts Cage",
    "Bunk Hall",
    "Machine Shop",
    "Signal Room",
    "Service Lift",
  ],
  facility: [
    "Loading Dock",
    "Sterile Corridor",
    "Specimen Archive",
    "Diagnostics Lab",
    "Cooling Stack",
    "Containment Gate",
    "Control Theater",
    "Machine Hall",
    "Research Annex",
    "Calibration Room",
    "Inventory Cage",
    "Waste Processor",
    "Server Vault",
    "Pressure Lobby",
    "Observation Cell",
    "Maintenance Bay",
    "Transit Tunnel",
    "Relay Chamber",
    "Inspection Office",
    "Emergency Station",
    "Access Gallery",
    "Filter Room",
    "Recovery Ward",
    "Utility Trench",
  ],
} as const;

interface ThemeSpec {
  key: keyof typeof ROOM_NAME_POOLS;
  itemName: string;
  itemDescription: string;
  puzzleName: string;
  puzzleDescription: string;
  lockName: string;
  lockDescription: string;
  npcName: string;
  npcDescription: string;
  goalDescription: string;
  roomSuffix: string;
}

function detectTheme(request: GameGenerationRequest): ThemeSpec {
  const text = `${request.description} ${request.genre ?? ""}`.toLowerCase();

  if (/(ship|starship|freighter|cruiser|vessel|bridge|captain)/.test(text)) {
    return {
      key: "ship",
      itemName: "Maintenance Toolkit",
      itemDescription:
        "A toolkit whose previous owner labelled every wrench as 'probably essential'.",
      puzzleName: "Navigation Relay Calibration",
      puzzleDescription:
        "A relay console sulks in the middle of the room, refusing to function until someone applies competence.",
      lockName: "Command Bulkhead",
      lockDescription:
        "A bulkhead blocks the way forward until the ship's navigation relay stops pretending to be decorative.",
      npcName: "Quartermaster Bell",
      npcDescription:
        "A quartermaster with the calm expression of someone who has filed too many incident reports.",
      goalDescription: "Reach the command end of the ship once the final bulkhead is open.",
      roomSuffix: "aboard a vessel that has seen better procurement cycles.",
    };
  }

  if (/(lab|facility|research|bunker|reactor|experiment|archive)/.test(text)) {
    return {
      key: "facility",
      itemName: "Calibration Kit",
      itemDescription:
        "A foam-lined case containing enough precision tools to alarm anyone near expensive machinery.",
      puzzleName: "Control Matrix Recalibration",
      puzzleDescription:
        "The control matrix insists it is perfectly configured, which is exactly what a misconfigured matrix would say.",
      lockName: "Containment Door",
      lockDescription:
        "The final containment door will only unlock once the control matrix stops making policy decisions.",
      npcName: "Technician Vale",
      npcDescription:
        "A technician who has survived by never trusting status lights that claim everything is fine.",
      goalDescription: "Reach the secured control room beyond the final containment door.",
      roomSuffix: "inside a facility whose safety manual reads like speculative fiction.",
    };
  }

  return {
    key: "station",
    itemName: "Field Service Kit",
    itemDescription:
      "A service kit full of practical tools and one mysterious implement no committee can name.",
    puzzleName: "Transit Core Alignment",
    puzzleDescription:
      "The transit core is out of alignment and deeply offended that anyone noticed.",
    lockName: "Operations Seal",
    lockDescription:
      "The last operations seal stays locked until the transit core is properly aligned.",
    npcName: "Administrator Moss",
    npcDescription:
      "An administrator who looks as though they have personally lost arguments with every maintenance form on the station.",
    goalDescription: "Reach operations once the final seal gives up on being difficult.",
    roomSuffix: "on an orbital installation run by committees and loose wiring.",
  };
}

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
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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

function buildRoomDescription(
  name: string,
  request: GameGenerationRequest,
  theme: ThemeSpec,
): string {
  return `${name} hums with just enough activity to imply responsibility without suggesting competence. It exists ${theme.roomSuffix} The current mission brief says this all relates to ${request.description.toLowerCase()}.`;
}

function pickRoomNames(
  roomCount: number,
  theme: ThemeSpec,
  rng: () => number,
): string[] {
  const pool = shuffle(ROOM_NAME_POOLS[theme.key], rng);
  const names: string[] = [];

  for (let index = 0; index < roomCount; index += 1) {
    names.push(pool[index] ?? `Sector ${index + 1}`);
  }

  return names;
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

function pickUnusedDirection(usedDirections: Set<Direction>): Direction {
  return (
    CARDINAL_DIRECTIONS.find((direction) => !usedDirections.has(direction)) ?? "east"
  );
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

export function buildDeterministicWorld(
  request: GameGenerationRequest,
  seed: string,
): GameWorld {
  const rng = createRng(`${seed}:${request.description}:${request.genre ?? ""}:${request.size}`);
  const theme = detectTheme(request);
  const config = SIZE_CONFIG[request.size];
  const roomNames = pickRoomNames(config.rooms, theme, rng);

  const rooms: Record<string, Room> = {};
  const items: Record<string, Item> = {};
  const npcs: Record<string, NPC> = {};
  const puzzles: Record<string, Puzzle> = {};
  const locks: Record<string, Lock> = {};
  const connections: Connection[] = [];
  const usedDirections = new Map<string, Set<Direction>>();
  const roomCoordinates = new Map<string, { x: number; y: number }>();
  const occupied = new Set<string>();

  const roomIds = Array.from({ length: config.rooms }, (_, index) => `room-${index + 1}`);
  const branchCount = Math.min(config.branches, Math.max(1, config.rooms - 4));
  const mainRoomCount = config.rooms - branchCount;

  for (let index = 0; index < roomIds.length; index += 1) {
    const roomId = roomIds[index];
    const roomName = roomNames[index];
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      description: buildRoomDescription(roomName, request, theme),
      itemIds: [],
      npcIds: [],
      ...(index === 0
        ? {
            firstVisitText: `You arrive in ${roomName}, which appears to have been designed by someone who mistook bureaucracy for interior decoration.`,
          }
        : {}),
    };
  }

  const startRoomId = roomIds[0];
  roomCoordinates.set(startRoomId, { x: 0, y: 0 });
  occupied.add(getCoordinateKey(0, 0));

  for (let index = 0; index < mainRoomCount - 1; index += 1) {
    const currentRoomId = roomIds[index];
    const nextRoomId = roomIds[index + 1];
    const currentCoordinate = roomCoordinates.get(currentRoomId)!;
    const currentUsedDirections = usedDirections.get(currentRoomId) ?? new Set<Direction>();

    const candidateDirections = shuffle(CARDINAL_DIRECTIONS, rng).filter((direction) => {
      if (currentUsedDirections.has(direction)) {
        return false;
      }

      const offset = getDirectionOffset(direction);
      const nextX = currentCoordinate.x + offset.x;
      const nextY = currentCoordinate.y + offset.y;
      return !occupied.has(getCoordinateKey(nextX, nextY));
    });

    const direction = candidateDirections[0] ?? pickUnusedDirection(currentUsedDirections);
    const offset = getDirectionOffset(direction);
    const nextCoordinate = {
      x: currentCoordinate.x + offset.x,
      y: currentCoordinate.y + offset.y,
    };

    roomCoordinates.set(nextRoomId, nextCoordinate);
    occupied.add(getCoordinateKey(nextCoordinate.x, nextCoordinate.y));
    addConnection(connections, usedDirections, currentRoomId, nextRoomId, direction);
  }

  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const branchRoomId = roomIds[mainRoomCount + branchIndex];
    let attached = false;

    for (const parentRoomId of shuffle(roomIds.slice(1, mainRoomCount - 1), rng)) {
      const parentCoordinate = roomCoordinates.get(parentRoomId);
      if (!parentCoordinate) {
        continue;
      }

      const parentUsedDirections = usedDirections.get(parentRoomId) ?? new Set<Direction>();
      const candidateDirections = shuffle(CARDINAL_DIRECTIONS, rng).filter((direction) => {
        if (parentUsedDirections.has(direction)) {
          return false;
        }

        const offset = getDirectionOffset(direction);
        const branchX = parentCoordinate.x + offset.x;
        const branchY = parentCoordinate.y + offset.y;
        return !occupied.has(getCoordinateKey(branchX, branchY));
      });

      const direction = candidateDirections[0];
      if (!direction) {
        continue;
      }

      const offset = getDirectionOffset(direction);
      const coordinate = {
        x: parentCoordinate.x + offset.x,
        y: parentCoordinate.y + offset.y,
      };

      roomCoordinates.set(branchRoomId, coordinate);
      occupied.add(getCoordinateKey(coordinate.x, coordinate.y));
      addConnection(connections, usedDirections, parentRoomId, branchRoomId, direction);
      attached = true;
      break;
    }

    if (!attached) {
      const fallbackParent = roomIds[Math.max(0, mainRoomCount - 2)];
      const parentCoordinate = roomCoordinates.get(fallbackParent)!;
      const direction = pickUnusedDirection(
        usedDirections.get(fallbackParent) ?? new Set<Direction>(),
      );
      const offset = getDirectionOffset(direction);
      const coordinate = {
        x: parentCoordinate.x + offset.x + branchIndex + 1,
        y: parentCoordinate.y,
      };

      roomCoordinates.set(branchRoomId, coordinate);
      occupied.add(getCoordinateKey(coordinate.x, coordinate.y));
      addConnection(connections, usedDirections, fallbackParent, branchRoomId, direction);
    }
  }

  const toolkitId = "field-service-kit";
  const toolkitRoomId = roomIds[mainRoomCount] ?? roomIds[1];
  items[toolkitId] = {
    id: toolkitId,
    name: theme.itemName,
    description: theme.itemDescription,
    portable: true,
    usableWith: ["transit-core-puzzle"],
    properties: {
      criticalPath: true,
      seed,
    },
  };
  rooms[toolkitRoomId].itemIds.push(toolkitId);

  const memoId = "incident-memo";
  items[memoId] = {
    id: memoId,
    name: "Incident Memo",
    description:
      "A memo explaining that the current emergency was previously classified as 'theoretical paperwork'.",
    portable: true,
    properties: {
      flavor: true,
    },
  };
  rooms[startRoomId].itemIds.push(memoId);

  const npcId = "resident-bureaucrat";
  npcs[npcId] = {
    id: npcId,
    name: theme.npcName,
    description: theme.npcDescription,
    dialogue: {
      greeting:
        "If you are here to improve the situation, please queue in an orderly line behind causality.",
    },
    state: "waiting",
  };
  rooms[startRoomId].npcIds.push(npcId);

  const puzzleRoomId = roomIds[Math.max(2, Math.floor(mainRoomCount / 2))];
  const finalRoomId = roomIds[mainRoomCount - 1];
  const penultimateRoomId = roomIds[mainRoomCount - 2];
  const finalLockId = "final-operations-lock";
  const puzzleId = "transit-core-puzzle";

  puzzles[puzzleId] = {
    id: puzzleId,
    name: theme.puzzleName,
    roomId: puzzleRoomId,
    description: theme.puzzleDescription,
    state: "unsolved",
    solution: {
      action: "use",
      itemIds: [toolkitId],
      description: `Use the ${theme.itemName} in ${rooms[puzzleRoomId].name} to restore the system that unlocks the final door.`,
    },
    reward: {
      type: "unlock",
      targetId: finalLockId,
    },
  };

  locks[finalLockId] = {
    id: finalLockId,
    state: "locked",
    mechanism: "puzzle",
    puzzleId,
    conditionDescription: `Solve ${theme.puzzleName} to open the ${theme.lockName}.`,
  };

  const finalConnection = connections.find(
    (connection) =>
      (connection.fromRoomId === penultimateRoomId && connection.toRoomId === finalRoomId) ||
      (connection.fromRoomId === finalRoomId && connection.toRoomId === penultimateRoomId),
  );

  if (finalConnection) {
    finalConnection.lockId = finalLockId;
  }

  return {
    rooms,
    items,
    npcs,
    connections,
    puzzles,
    locks,
    winCondition: {
      type: "reach_room",
      targetId: finalRoomId,
      description: `${theme.goalDescription} The destination is ${rooms[finalRoomId].name}.`,
    },
    startRoomId,
  };
}
