import type { GameWorld } from "@/types";

export interface ValidationError {
  code: string;
  message: string;
  severity: "error" | "warning";
  context?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// BFS returning the set of reachable room IDs.
// `excludedLockId` lets us skip connections guarded by a specific lock.
function reachableRooms(
  world: GameWorld,
  startId: string,
  excludedLockId?: string,
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const conn of world.connections) {
      if (excludedLockId && conn.lockId === excludedLockId) continue;

      if (conn.fromRoomId === current && !visited.has(conn.toRoomId)) {
        queue.push(conn.toRoomId);
      }
      if (conn.toRoomId === current && !visited.has(conn.fromRoomId)) {
        queue.push(conn.fromRoomId);
      }
    }
  }

  return visited;
}

// Find which room contains a given item
function findItemRoom(world: GameWorld, itemId: string): string | undefined {
  for (const room of Object.values(world.rooms)) {
    if (room.itemIds.includes(itemId)) return room.id;
  }
  return undefined;
}

export function validateWorld(world: GameWorld): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const push = (
    list: ValidationError[],
    code: string,
    message: string,
    severity: "error" | "warning",
    context?: Record<string, unknown>,
  ) => {
    list.push({ code, message, severity, context });
  };

  // ── 7. Empty World ──
  if (Object.keys(world.rooms).length === 0) {
    push(errors, "EMPTY_WORLD", "World must have at least one room.", "error");
    return { valid: false, errors, warnings };
  }

  // ── 2. Start Room Exists ──
  if (!world.rooms[world.startRoomId]) {
    push(
      errors,
      "INVALID_START_ROOM",
      `startRoomId "${world.startRoomId}" does not exist in rooms.`,
      "error",
      { startRoomId: world.startRoomId },
    );
  }

  // ── 3. Referential Integrity ──

  // Room itemIds → items
  for (const room of Object.values(world.rooms)) {
    for (const itemId of room.itemIds) {
      if (!world.items[itemId]) {
        push(
          errors,
          "INVALID_ITEM_REF",
          `Room "${room.id}" references non-existent item "${itemId}".`,
          "error",
          { roomId: room.id, itemId },
        );
      }
    }
    // Room npcIds → npcs
    for (const npcId of room.npcIds) {
      if (!world.npcs[npcId]) {
        push(
          errors,
          "INVALID_NPC_REF",
          `Room "${room.id}" references non-existent NPC "${npcId}".`,
          "error",
          { roomId: room.id, npcId },
        );
      }
    }
  }

  // Connection refs
  for (const conn of world.connections) {
    if (!world.rooms[conn.fromRoomId]) {
      push(
        errors,
        "INVALID_ROOM_REF",
        `Connection references non-existent fromRoomId "${conn.fromRoomId}".`,
        "error",
        { fromRoomId: conn.fromRoomId, toRoomId: conn.toRoomId },
      );
    }
    if (!world.rooms[conn.toRoomId]) {
      push(
        errors,
        "INVALID_ROOM_REF",
        `Connection references non-existent toRoomId "${conn.toRoomId}".`,
        "error",
        { fromRoomId: conn.fromRoomId, toRoomId: conn.toRoomId },
      );
    }
    if (conn.lockId && !world.locks[conn.lockId]) {
      push(
        errors,
        "INVALID_LOCK_REF",
        `Connection references non-existent lock "${conn.lockId}".`,
        "error",
        { lockId: conn.lockId, fromRoomId: conn.fromRoomId, toRoomId: conn.toRoomId },
      );
    }
  }

  // Lock refs
  for (const lock of Object.values(world.locks)) {
    if (lock.keyItemId && !world.items[lock.keyItemId]) {
      push(
        errors,
        "INVALID_KEY_ITEM_REF",
        `Lock "${lock.id}" references non-existent key item "${lock.keyItemId}".`,
        "error",
        { lockId: lock.id, keyItemId: lock.keyItemId },
      );
    }
    if (lock.puzzleId && !world.puzzles[lock.puzzleId]) {
      push(
        errors,
        "INVALID_PUZZLE_REF",
        `Lock "${lock.id}" references non-existent puzzle "${lock.puzzleId}".`,
        "error",
        { lockId: lock.id, puzzleId: lock.puzzleId },
      );
    }
  }

  // Puzzle refs
  for (const puzzle of Object.values(world.puzzles)) {
    if (!world.rooms[puzzle.roomId]) {
      push(
        errors,
        "INVALID_PUZZLE_ROOM_REF",
        `Puzzle "${puzzle.id}" references non-existent room "${puzzle.roomId}".`,
        "error",
        { puzzleId: puzzle.id, roomId: puzzle.roomId },
      );
    }
    if (puzzle.solution.itemIds) {
      for (const itemId of puzzle.solution.itemIds) {
        if (!world.items[itemId]) {
          push(
            errors,
            "INVALID_SOLUTION_ITEM_REF",
            `Puzzle "${puzzle.id}" solution references non-existent item "${itemId}".`,
            "error",
            { puzzleId: puzzle.id, itemId },
          );
        }
      }
    }
    if (puzzle.solution.npcId && !world.npcs[puzzle.solution.npcId]) {
      push(
        errors,
        "INVALID_SOLUTION_NPC_REF",
        `Puzzle "${puzzle.id}" solution references non-existent NPC "${puzzle.solution.npcId}".`,
        "error",
        { puzzleId: puzzle.id, npcId: puzzle.solution.npcId },
      );
    }
  }

  // Win condition target
  const wc = world.winCondition;
  switch (wc.type) {
    case "reach_room":
      if (!world.rooms[wc.targetId]) {
        push(
          errors,
          "INVALID_WIN_TARGET",
          `Win condition targets non-existent room "${wc.targetId}".`,
          "error",
          { targetId: wc.targetId, type: wc.type },
        );
      }
      break;
    case "collect_items":
      if (!world.items[wc.targetId]) {
        push(
          errors,
          "INVALID_WIN_TARGET",
          `Win condition targets non-existent item "${wc.targetId}".`,
          "error",
          { targetId: wc.targetId, type: wc.type },
        );
      }
      break;
    case "solve_puzzle":
      if (!world.puzzles[wc.targetId]) {
        push(
          errors,
          "INVALID_WIN_TARGET",
          `Win condition targets non-existent puzzle "${wc.targetId}".`,
          "error",
          { targetId: wc.targetId, type: wc.type },
        );
      }
      break;
    case "flag":
      // Flags are dynamic — no entity to validate
      break;
  }

  // ── 1. Graph Connectivity (only if start room is valid) ──
  if (world.rooms[world.startRoomId]) {
    const reached = reachableRooms(world, world.startRoomId);
    for (const roomId of Object.keys(world.rooms)) {
      if (!reached.has(roomId)) {
        push(
          errors,
          "DISCONNECTED_ROOM",
          `Room "${roomId}" is not reachable from startRoomId "${world.startRoomId}".`,
          "error",
          { roomId, startRoomId: world.startRoomId },
        );
      }
    }
  }

  // ── 5. Duplicate Connection Check ──
  const connKeys = new Set<string>();
  const edgeKeys = new Set<string>();
  for (const conn of world.connections) {
    const directionalKeys = [
      {
        key: `${conn.fromRoomId}::${conn.direction}`,
        roomId: conn.fromRoomId,
        direction: conn.direction,
      },
      {
        key: `${conn.toRoomId}::${conn.reverseDirection}`,
        roomId: conn.toRoomId,
        direction: conn.reverseDirection,
      },
    ];

    for (const directionalKey of directionalKeys) {
      if (connKeys.has(directionalKey.key)) {
        push(
          errors,
          "DUPLICATE_CONNECTION",
          `Duplicate connection from "${directionalKey.roomId}" going "${directionalKey.direction}".`,
          "error",
          { fromRoomId: directionalKey.roomId, direction: directionalKey.direction },
        );
      }
      connKeys.add(directionalKey.key);
    }

    const edgeKey = [conn.fromRoomId, conn.toRoomId].sort().join("::");
    if (edgeKeys.has(edgeKey)) {
      push(
        errors,
        "DUPLICATE_CONNECTION",
        `Duplicate corridor recorded between "${conn.fromRoomId}" and "${conn.toRoomId}". Each connection is already bidirectional.`,
        "error",
        {
          fromRoomId: conn.fromRoomId,
          toRoomId: conn.toRoomId,
          direction: conn.direction,
          reverseDirection: conn.reverseDirection,
        },
      );
    }
    edgeKeys.add(edgeKey);
  }

  // ── 6. Key Behind Own Lock ──
  for (const lock of Object.values(world.locks)) {
    if (lock.mechanism !== "key" || !lock.keyItemId) continue;
    if (!world.items[lock.keyItemId]) continue; // already flagged

    const keyRoom = findItemRoom(world, lock.keyItemId);
    if (!keyRoom) continue; // key not placed in any room

    if (world.rooms[world.startRoomId]) {
      const reachable = reachableRooms(world, world.startRoomId, lock.id);
      if (!reachable.has(keyRoom)) {
        push(
          errors,
          "KEY_BEHIND_OWN_LOCK",
          `Key "${lock.keyItemId}" for lock "${lock.id}" is only reachable through the lock it opens.`,
          "error",
          { lockId: lock.id, keyItemId: lock.keyItemId, keyRoomId: keyRoom },
        );
      }
    }
  }

  // ── 8. Win Condition Reachability ──
  if (world.rooms[world.startRoomId]) {
    const reached = reachableRooms(world, world.startRoomId);

    if (wc.type === "reach_room" && world.rooms[wc.targetId]) {
      if (!reached.has(wc.targetId)) {
        push(
          errors,
          "UNREACHABLE_WIN_CONDITION",
          `Win condition room "${wc.targetId}" is not reachable from the start room.`,
          "error",
          { targetId: wc.targetId, type: wc.type },
        );
      }
    }

    if (wc.type === "solve_puzzle" && world.puzzles[wc.targetId]) {
      const puzzleRoom = world.puzzles[wc.targetId].roomId;
      if (world.rooms[puzzleRoom] && !reached.has(puzzleRoom)) {
        push(
          errors,
          "UNREACHABLE_WIN_CONDITION",
          `Win condition puzzle "${wc.targetId}" is in unreachable room "${puzzleRoom}".`,
          "error",
          { targetId: wc.targetId, type: wc.type, roomId: puzzleRoom },
        );
      }
    }

    if (wc.type === "collect_items" && world.items[wc.targetId]) {
      const itemRoom = findItemRoom(world, wc.targetId);
      if (itemRoom && !reached.has(itemRoom)) {
        push(
          errors,
          "UNREACHABLE_WIN_CONDITION",
          `Win condition item "${wc.targetId}" is in unreachable room "${itemRoom}".`,
          "error",
          { targetId: wc.targetId, type: wc.type, roomId: itemRoom },
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
