import type {
  GameWorld,
  PlayerState,
  TurnEntry,
  Room,
  Item,
  NPC,
  Interactable,
  Puzzle,
  Lock,
  Direction,
} from "@/types";

export interface LocalContext {
  currentRoom: Room;
  nearbyRooms: Array<{
    direction: Direction;
    room: Room;
    locked: boolean;
    hidden: boolean;
  }>;
  inventoryItems: Item[];
  roomItems: Item[];
  roomNPCs: NPC[];
  roomInteractables: Interactable[];
  activePuzzles: Puzzle[];
  relevantLocks: Lock[];
  recentHistory: TurnEntry[];
  playerFlags: Record<string, boolean>;
  isFirstVisit: boolean;
}

const DEFAULT_HISTORY_LIMIT = 10;

export function buildLocalContext(
  world: GameWorld,
  player: PlayerState,
  history: TurnEntry[],
  historyLimit: number = DEFAULT_HISTORY_LIMIT
): LocalContext {
  const currentRoom = world.rooms[player.currentRoomId];
  if (!currentRoom) {
    throw new Error(
      `Corrupted state: room "${player.currentRoomId}" not found in world`
    );
  }

  const nearbyRooms = resolveNearbyRooms(world, player.currentRoomId);
  const inventoryItems = resolveItems(world, player.inventory);
  const roomItems = resolveItems(world, currentRoom.itemIds);
  const roomNPCs = resolveNPCs(world, currentRoom.npcIds);
  const roomInteractables = resolveInteractables(world, currentRoom.id);
  const activePuzzles = findActivePuzzles(world, currentRoom.id);
  const relevantLocks = findRelevantLocks(world, player.currentRoomId);
  const recentHistory = history.slice(-historyLimit);
  const isFirstVisit = !player.visitedRooms.includes(currentRoom.id);

  return {
    currentRoom,
    nearbyRooms,
    inventoryItems,
    roomItems,
    roomNPCs,
    roomInteractables,
    activePuzzles,
    relevantLocks,
    recentHistory,
    playerFlags: player.flags,
    isFirstVisit,
  };
}

function resolveNearbyRooms(
  world: GameWorld,
  currentRoomId: string
): LocalContext["nearbyRooms"] {
  const nearby: LocalContext["nearbyRooms"] = [];

  for (const conn of world.connections) {
    let direction: Direction | null = null;
    let targetRoomId: string | null = null;

    if (conn.fromRoomId === currentRoomId) {
      direction = conn.direction;
      targetRoomId = conn.toRoomId;
    } else if (conn.toRoomId === currentRoomId) {
      direction = conn.reverseDirection;
      targetRoomId = conn.fromRoomId;
    }

    if (!direction || !targetRoomId) continue;

    // Skip connections that are still hidden (hidden === true)
    if (conn.hidden === true) continue;

    const room = world.rooms[targetRoomId];
    if (!room) continue;

    const locked = conn.lockId
      ? world.locks[conn.lockId]?.state === "locked"
      : false;

    nearby.push({
      direction,
      room,
      locked,
      hidden: conn.hidden ?? false,
    });
  }

  return nearby;
}

function resolveItems(world: GameWorld, itemIds: string[]): Item[] {
  const items: Item[] = [];
  for (const id of itemIds) {
    const item = world.items[id];
    if (item) items.push(item);
  }
  return items;
}

function resolveNPCs(world: GameWorld, npcIds: string[]): NPC[] {
  const npcs: NPC[] = [];
  for (const id of npcIds) {
    const npc = world.npcs[id];
    if (npc) npcs.push(npc);
  }
  return npcs;
}

function resolveInteractables(world: GameWorld, roomId: string): Interactable[] {
  return Object.values(world.interactables ?? {}).filter(
    (interactable) => interactable.roomId === roomId
  );
}

function findActivePuzzles(world: GameWorld, roomId: string): Puzzle[] {
  return Object.values(world.puzzles).filter(
    (p) => p.roomId === roomId && p.state === "unsolved"
  );
}

function findRelevantLocks(world: GameWorld, currentRoomId: string): Lock[] {
  const lockIds = new Set<string>();

  for (const conn of world.connections) {
    if (
      conn.lockId &&
      (conn.fromRoomId === currentRoomId || conn.toRoomId === currentRoomId)
    ) {
      lockIds.add(conn.lockId);
    }
  }

  const locks: Lock[] = [];
  for (const id of lockIds) {
    const lock = world.locks[id];
    if (lock) locks.push(lock);
  }
  return locks;
}
