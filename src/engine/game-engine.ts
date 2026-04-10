import type {
  Direction,
  GameWorld,
  PlayerState,
  ProposedAction,
  Connection,
} from "@/types";

export interface StateChange {
  type: string;
  details: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  stateChanges: StateChange[];
}

/**
 * Find a connection from the player's current room in the given direction.
 * Checks both fromRoomId→direction and toRoomId→reverseDirection.
 */
function findConnection(
  connections: Connection[],
  roomId: string,
  direction: Direction
): { connection: Connection; targetRoomId: string } | null {
  for (const conn of connections) {
    if (conn.fromRoomId === roomId && conn.direction === direction) {
      return { connection: conn, targetRoomId: conn.toRoomId };
    }
    if (conn.toRoomId === roomId && conn.reverseDirection === direction) {
      return { connection: conn, targetRoomId: conn.fromRoomId };
    }
  }
  return null;
}

function handleMove(
  action: Extract<ProposedAction, { type: "move" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const result = findConnection(
    world.connections,
    player.currentRoomId,
    action.direction
  );
  if (!result) {
    return {
      success: false,
      message: `There is no exit to the ${action.direction}.`,
      stateChanges: [],
    };
  }

  const { connection, targetRoomId } = result;

  if (connection.hidden) {
    return {
      success: false,
      message: `There is no exit to the ${action.direction}.`,
      stateChanges: [],
    };
  }

  if (connection.lockId) {
    const lock = world.locks[connection.lockId];
    if (lock && lock.state === "locked") {
      return {
        success: false,
        message: `The way ${action.direction} is locked.`,
        stateChanges: [],
      };
    }
  }

  const targetRoom = world.rooms[targetRoomId];
  const isFirstVisit = !player.visitedRooms.includes(targetRoomId);

  const stateChanges: StateChange[] = [
    {
      type: "player_moved",
      details: {
        from: player.currentRoomId,
        to: targetRoomId,
        direction: action.direction,
      },
    },
  ];

  player.currentRoomId = targetRoomId;
  if (isFirstVisit) {
    player.visitedRooms = [...player.visitedRooms, targetRoomId];
    stateChanges.push({
      type: "room_first_visit",
      details: { roomId: targetRoomId },
    });
  }
  player.turnCount += 1;
  player.stateVersion += 1;

  let message = `You move ${action.direction} to ${targetRoom.name}.`;
  if (isFirstVisit && targetRoom.firstVisitText) {
    message += ` ${targetRoom.firstVisitText}`;
  }

  return { success: true, message, stateChanges };
}

function handlePickup(
  action: Extract<ProposedAction, { type: "pickup" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const room = world.rooms[player.currentRoomId];
  if (!room.itemIds.includes(action.itemId)) {
    return {
      success: false,
      message: `There is no such item here.`,
      stateChanges: [],
    };
  }

  const item = world.items[action.itemId];
  if (!item) {
    return {
      success: false,
      message: `That item does not exist.`,
      stateChanges: [],
    };
  }

  if (!item.portable) {
    return {
      success: false,
      message: `You can't pick up the ${item.name}.`,
      stateChanges: [],
    };
  }

  room.itemIds = room.itemIds.filter((id) => id !== action.itemId);
  player.inventory = [...player.inventory, action.itemId];
  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `You pick up the ${item.name}.`,
    stateChanges: [
      {
        type: "item_picked_up",
        details: {
          itemId: action.itemId,
          roomId: player.currentRoomId,
        },
      },
    ],
  };
}

function handleDrop(
  action: Extract<ProposedAction, { type: "drop" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  if (!player.inventory.includes(action.itemId)) {
    return {
      success: false,
      message: `You don't have that item.`,
      stateChanges: [],
    };
  }

  const item = world.items[action.itemId];
  const room = world.rooms[player.currentRoomId];

  player.inventory = player.inventory.filter((id) => id !== action.itemId);
  room.itemIds = [...room.itemIds, action.itemId];
  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `You drop the ${item.name}.`,
    stateChanges: [
      {
        type: "item_dropped",
        details: {
          itemId: action.itemId,
          roomId: player.currentRoomId,
        },
      },
    ],
  };
}

function handleUseItem(
  action: Extract<ProposedAction, { type: "use_item" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  if (!player.inventory.includes(action.itemId)) {
    return {
      success: false,
      message: `You don't have that item.`,
      stateChanges: [],
    };
  }

  const item = world.items[action.itemId];
  if (!item) {
    return {
      success: false,
      message: `That item does not exist.`,
      stateChanges: [],
    };
  }

  const targetExists =
    action.targetId in world.items ||
    action.targetId in world.npcs ||
    action.targetId in world.locks ||
    action.targetId in world.puzzles;

  if (!targetExists) {
    return {
      success: false,
      message: `The target does not exist.`,
      stateChanges: [],
    };
  }

  if (!item.usableWith || !item.usableWith.includes(action.targetId)) {
    return {
      success: false,
      message: `You can't use the ${item.name} on that.`,
      stateChanges: [],
    };
  }

  const stateChanges: StateChange[] = [
    {
      type: "item_used",
      details: { itemId: action.itemId, targetId: action.targetId },
    },
  ];

  // If the target is a lock, unlock it
  if (action.targetId in world.locks) {
    const lock = world.locks[action.targetId];
    if (lock.state === "locked") {
      lock.state = "unlocked";
      stateChanges.push({
        type: "lock_unlocked",
        details: { lockId: action.targetId },
      });
    }
  }

  // If the target is a puzzle, solve it
  if (action.targetId in world.puzzles) {
    const puzzle = world.puzzles[action.targetId];
    if (puzzle.state === "unsolved") {
      puzzle.state = "solved";
      stateChanges.push({
        type: "puzzle_solved",
        details: { puzzleId: action.targetId },
      });
      applyPuzzleReward(puzzle, world, player, stateChanges);
    }
  }

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `You use the ${item.name} on the ${action.targetId}.`,
    stateChanges,
  };
}

function handleUnlock(
  action: Extract<ProposedAction, { type: "unlock" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const lock = world.locks[action.lockId];
  if (!lock) {
    return {
      success: false,
      message: `That lock does not exist.`,
      stateChanges: [],
    };
  }

  if (lock.state === "unlocked") {
    return {
      success: false,
      message: `It is already unlocked.`,
      stateChanges: [],
    };
  }

  if (lock.mechanism === "key") {
    const keyId = action.itemId ?? lock.keyItemId;
    if (!keyId || !player.inventory.includes(keyId)) {
      return {
        success: false,
        message: `You don't have the required key.`,
        stateChanges: [],
      };
    }
    if (lock.keyItemId && keyId !== lock.keyItemId) {
      return {
        success: false,
        message: `That is not the right key.`,
        stateChanges: [],
      };
    }
  } else if (lock.mechanism === "puzzle") {
    if (lock.puzzleId) {
      const puzzle = world.puzzles[lock.puzzleId];
      if (!puzzle || puzzle.state !== "solved") {
        return {
          success: false,
          message: `The associated puzzle has not been solved.`,
          stateChanges: [],
        };
      }
    }
  }

  lock.state = "unlocked";
  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `You unlock it.`,
    stateChanges: [
      {
        type: "lock_unlocked",
        details: { lockId: action.lockId },
      },
    ],
  };
}

function applyPuzzleReward(
  puzzle: {
    reward: {
      type: "unlock" | "item" | "flag" | "npc_state";
      targetId: string;
      value?: string;
    };
  },
  world: GameWorld,
  player: PlayerState,
  stateChanges: StateChange[]
): void {
  const { reward } = puzzle;

  switch (reward.type) {
    case "unlock": {
      const lock = world.locks[reward.targetId];
      if (lock && lock.state === "locked") {
        lock.state = "unlocked";
        stateChanges.push({
          type: "lock_unlocked",
          details: { lockId: reward.targetId },
        });
      }
      break;
    }
    case "item": {
      player.inventory = [...player.inventory, reward.targetId];
      stateChanges.push({
        type: "item_rewarded",
        details: { itemId: reward.targetId },
      });
      break;
    }
    case "flag": {
      player.flags = {
        ...player.flags,
        [reward.targetId]: reward.value !== "false",
      };
      stateChanges.push({
        type: "flag_set",
        details: { flag: reward.targetId, value: reward.value !== "false" },
      });
      break;
    }
    case "npc_state": {
      const npc = world.npcs[reward.targetId];
      if (npc && reward.value) {
        npc.state = reward.value;
        stateChanges.push({
          type: "npc_state_changed",
          details: { npcId: reward.targetId, newState: reward.value },
        });
      }
      break;
    }
  }
}

function handleSolvePuzzle(
  action: Extract<ProposedAction, { type: "solve_puzzle" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const puzzle = world.puzzles[action.puzzleId];
  if (!puzzle) {
    return {
      success: false,
      message: `That puzzle does not exist.`,
      stateChanges: [],
    };
  }

  if (puzzle.state === "solved") {
    return {
      success: false,
      message: `The ${puzzle.name} has already been solved.`,
      stateChanges: [],
    };
  }

  if (puzzle.roomId !== player.currentRoomId) {
    return {
      success: false,
      message: `You are not in the right room for this puzzle.`,
      stateChanges: [],
    };
  }

  if (action.action !== puzzle.solution.action) {
    return {
      success: false,
      message: `That doesn't seem to work.`,
      stateChanges: [],
    };
  }

  if (puzzle.solution.itemIds) {
    for (const itemId of puzzle.solution.itemIds) {
      if (!player.inventory.includes(itemId)) {
        const item = world.items[itemId];
        const name = item ? item.name : itemId;
        return {
          success: false,
          message: `You need the ${name} to solve this puzzle.`,
          stateChanges: [],
        };
      }
    }
  }

  puzzle.state = "solved";
  const stateChanges: StateChange[] = [
    {
      type: "puzzle_solved",
      details: { puzzleId: action.puzzleId },
    },
  ];

  applyPuzzleReward(puzzle, world, player, stateChanges);

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `You solved the ${puzzle.name}!`,
    stateChanges,
  };
}

function handleTalkNpc(
  action: Extract<ProposedAction, { type: "talk_npc" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const npc = world.npcs[action.npcId];
  if (!npc) {
    return {
      success: false,
      message: `That person does not exist.`,
      stateChanges: [],
    };
  }

  const room = world.rooms[player.currentRoomId];
  if (!room.npcIds.includes(action.npcId)) {
    return {
      success: false,
      message: `There is no one by that name here.`,
      stateChanges: [],
    };
  }

  const dialogue = npc.dialogue[npc.state] ?? "...";

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `${npc.name} says: "${dialogue}"`,
    stateChanges: [
      {
        type: "npc_talked",
        details: { npcId: action.npcId, state: npc.state },
      },
    ],
  };
}

function handleNpcStateChange(
  action: Extract<ProposedAction, { type: "npc_state_change" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const npc = world.npcs[action.npcId];
  if (!npc) {
    return {
      success: false,
      message: `That person does not exist.`,
      stateChanges: [],
    };
  }

  const room = world.rooms[player.currentRoomId];
  if (!room.npcIds.includes(action.npcId)) {
    return {
      success: false,
      message: `There is no one by that name here.`,
      stateChanges: [],
    };
  }

  const oldState = npc.state;
  npc.state = action.newState;

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `${npc.name}'s demeanor changes.`,
    stateChanges: [
      {
        type: "npc_state_changed",
        details: {
          npcId: action.npcId,
          oldState,
          newState: action.newState,
        },
      },
    ],
  };
}

function handleSetFlag(
  action: Extract<ProposedAction, { type: "set_flag" }>,
  _world: GameWorld,
  player: PlayerState
): ActionResult {
  player.flags = { ...player.flags, [action.flag]: action.value };
  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `Flag "${action.flag}" set to ${action.value}.`,
    stateChanges: [
      {
        type: "flag_set",
        details: { flag: action.flag, value: action.value },
      },
    ],
  };
}

function handleRevealConnection(
  action: Extract<ProposedAction, { type: "reveal_connection" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const conn = world.connections.find(
    (c) =>
      (c.fromRoomId === action.fromRoomId &&
        c.toRoomId === action.toRoomId) ||
      (c.fromRoomId === action.toRoomId && c.toRoomId === action.fromRoomId)
  );

  if (!conn) {
    return {
      success: false,
      message: `No such connection exists.`,
      stateChanges: [],
    };
  }

  conn.hidden = false;

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `A hidden passage has been revealed!`,
    stateChanges: [
      {
        type: "connection_revealed",
        details: {
          fromRoomId: action.fromRoomId,
          toRoomId: action.toRoomId,
        },
      },
    ],
  };
}

function handleAddItemToRoom(
  action: Extract<ProposedAction, { type: "add_item_to_room" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const item = world.items[action.itemId];
  if (!item) {
    return {
      success: false,
      message: `That item does not exist.`,
      stateChanges: [],
    };
  }

  const room = world.rooms[action.roomId];
  if (!room) {
    return {
      success: false,
      message: `That room does not exist.`,
      stateChanges: [],
    };
  }

  room.itemIds = [...room.itemIds, action.itemId];

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `The ${item.name} appears in ${room.name}.`,
    stateChanges: [
      {
        type: "item_added_to_room",
        details: { itemId: action.itemId, roomId: action.roomId },
      },
    ],
  };
}

function handleRemoveItemFromRoom(
  action: Extract<ProposedAction, { type: "remove_item_from_room" }>,
  world: GameWorld,
  player: PlayerState
): ActionResult {
  const item = world.items[action.itemId];
  if (!item) {
    return {
      success: false,
      message: `That item does not exist.`,
      stateChanges: [],
    };
  }

  const room = world.rooms[action.roomId];
  if (!room) {
    return {
      success: false,
      message: `That room does not exist.`,
      stateChanges: [],
    };
  }

  if (!room.itemIds.includes(action.itemId)) {
    return {
      success: false,
      message: `The ${item.name} is not in ${room.name}.`,
      stateChanges: [],
    };
  }

  room.itemIds = room.itemIds.filter((id) => id !== action.itemId);

  player.turnCount += 1;
  player.stateVersion += 1;

  return {
    success: true,
    message: `The ${item.name} is removed from ${room.name}.`,
    stateChanges: [
      {
        type: "item_removed_from_room",
        details: { itemId: action.itemId, roomId: action.roomId },
      },
    ],
  };
}

/**
 * Apply a proposed action to the game world and player state.
 * Returns a new ActionResult with success/failure, message, and state changes.
 *
 * IMPORTANT: This function creates deep copies of world and player internally
 * so the original inputs are never mutated. The caller should use the returned
 * stateChanges or read from the copies.
 */
export function applyAction(
  action: ProposedAction,
  world: GameWorld,
  player: PlayerState
): { result: ActionResult; world: GameWorld; player: PlayerState } {
  // Deep copy to avoid mutating originals
  const newWorld: GameWorld = JSON.parse(JSON.stringify(world));
  const newPlayer: PlayerState = JSON.parse(JSON.stringify(player));

  let result: ActionResult;

  switch (action.type) {
    case "move":
      result = handleMove(action, newWorld, newPlayer);
      break;
    case "pickup":
      result = handlePickup(action, newWorld, newPlayer);
      break;
    case "drop":
      result = handleDrop(action, newWorld, newPlayer);
      break;
    case "use_item":
      result = handleUseItem(action, newWorld, newPlayer);
      break;
    case "unlock":
      result = handleUnlock(action, newWorld, newPlayer);
      break;
    case "solve_puzzle":
      result = handleSolvePuzzle(action, newWorld, newPlayer);
      break;
    case "talk_npc":
      result = handleTalkNpc(action, newWorld, newPlayer);
      break;
    case "npc_state_change":
      result = handleNpcStateChange(action, newWorld, newPlayer);
      break;
    case "set_flag":
      result = handleSetFlag(action, newWorld, newPlayer);
      break;
    case "reveal_connection":
      result = handleRevealConnection(action, newWorld, newPlayer);
      break;
    case "add_item_to_room":
      result = handleAddItemToRoom(action, newWorld, newPlayer);
      break;
    case "remove_item_from_room":
      result = handleRemoveItemFromRoom(action, newWorld, newPlayer);
      break;
    default: {
      const _exhaustive: never = action;
      result = {
        success: false,
        message: `Unknown action type: ${(_exhaustive as ProposedAction).type}`,
        stateChanges: [],
      };
    }
  }

  return { result, world: newWorld, player: newPlayer };
}

/**
 * Check if the win condition is met.
 */
export function checkWinCondition(
  world: GameWorld,
  player: PlayerState
): boolean {
  const wc = world.winCondition;

  switch (wc.type) {
    case "reach_room":
      return player.currentRoomId === wc.targetId;
    case "collect_items": {
      // targetId is a comma-separated list of item IDs
      const requiredItems = wc.targetId.split(",").map((s) => s.trim());
      return requiredItems.every((id) => player.inventory.includes(id));
    }
    case "solve_puzzle":
      return world.puzzles[wc.targetId]?.state === "solved";
    case "flag":
      return player.flags[wc.targetId] === true;
    default:
      return false;
  }
}

/**
 * Get available exits from the player's current room.
 */
export function getAvailableExits(
  world: GameWorld,
  player: PlayerState
): Array<{
  direction: Direction;
  roomName: string;
  locked: boolean;
  hidden: boolean;
}> {
  const exits: Array<{
    direction: Direction;
    roomName: string;
    locked: boolean;
    hidden: boolean;
  }> = [];

  for (const conn of world.connections) {
    let direction: Direction | null = null;
    let targetRoomId: string | null = null;

    if (conn.fromRoomId === player.currentRoomId) {
      direction = conn.direction;
      targetRoomId = conn.toRoomId;
    } else if (conn.toRoomId === player.currentRoomId) {
      direction = conn.reverseDirection;
      targetRoomId = conn.fromRoomId;
    }

    if (direction && targetRoomId) {
      const targetRoom = world.rooms[targetRoomId];
      const locked = conn.lockId
        ? world.locks[conn.lockId]?.state === "locked"
        : false;
      const hidden = conn.hidden ?? false;

      exits.push({
        direction,
        roomName: targetRoom.name,
        locked,
        hidden,
      });
    }
  }

  return exits;
}
