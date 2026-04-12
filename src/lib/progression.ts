import { renderAsciiMap } from "@/components/AsciiMap";
import type { Connection, GameWorld, Lock, PlayerState, Puzzle, Room, WinCondition } from "@/types";

interface PathStep {
  roomId: string;
  directionFromPrevious?: string;
  connection?: Connection;
}

function findItemRoom(world: GameWorld, itemId: string): Room | null {
  for (const room of Object.values(world.rooms)) {
    if (room.itemIds.includes(itemId)) {
      return room;
    }
  }

  return null;
}

function getPuzzleSolutionDescription(world: GameWorld, puzzle: Puzzle): string {
  if (puzzle.solution.description?.trim()) {
    return puzzle.solution.description.trim();
  }

  const itemNames = (puzzle.solution.itemIds ?? [])
    .map((itemId) => world.items[itemId]?.name ?? itemId)
    .join(", ");
  const npcName = puzzle.solution.npcId
    ? world.npcs[puzzle.solution.npcId]?.name ?? puzzle.solution.npcId
    : null;
  const parts = [`Perform "${puzzle.solution.action}"`];

  if (itemNames) {
    parts.push(`with ${itemNames}`);
  }

  if (npcName) {
    parts.push(`while dealing with ${npcName}`);
  }

  return `${parts.join(" ")} in ${world.rooms[puzzle.roomId]?.name ?? puzzle.roomId}.`;
}

function getLockConditionDescription(world: GameWorld, lock: Lock): string {
  if (lock.conditionDescription?.trim()) {
    return lock.conditionDescription.trim();
  }

  if (lock.mechanism === "key") {
    const itemName = lock.keyItemId ? world.items[lock.keyItemId]?.name ?? lock.keyItemId : "the correct key";
    return `Unlock this lock with ${itemName}.`;
  }

  if (lock.mechanism === "puzzle") {
    const puzzleName = lock.puzzleId
      ? world.puzzles[lock.puzzleId]?.name ?? lock.puzzleId
      : "the required puzzle";
    return `Solve ${puzzleName} to unlock this lock.`;
  }

  return "Change the required NPC state to unlock this lock.";
}

function formatTable(
  headers: string[],
  rows: string[][],
): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );

  const formatRow = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index], " ")).join(" | ");

  return [
    formatRow(headers),
    widths.map((width) => "-".repeat(width)).join("-|-"),
    ...rows.map(formatRow),
  ].join("\n");
}

function findPath(
  world: GameWorld,
  startRoomId: string,
  targetRoomId: string,
  allowLocked: boolean,
): PathStep[] | null {
  const visited = new Set<string>([startRoomId]);
  const queue: PathStep[][] = [[{ roomId: startRoomId }]];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current.roomId === targetRoomId) {
      return path;
    }

    for (const connection of world.connections) {
      let nextRoomId: string | null = null;
      let direction: string | null = null;

      if (connection.fromRoomId === current.roomId) {
        nextRoomId = connection.toRoomId;
        direction = connection.direction;
      } else if (connection.toRoomId === current.roomId) {
        nextRoomId = connection.fromRoomId;
        direction = connection.reverseDirection;
      }

      if (!nextRoomId || !direction || visited.has(nextRoomId)) {
        continue;
      }

      if (!allowLocked && connection.lockId) {
        const lock = world.locks[connection.lockId];
        if (lock?.state === "locked") {
          continue;
        }
      }

      visited.add(nextRoomId);
      queue.push([
        ...path,
        {
          roomId: nextRoomId,
          directionFromPrevious: direction,
          connection,
        },
      ]);
    }
  }

  return null;
}

function buildLockRows(world: GameWorld, player: PlayerState): string[][] {
  return Object.values(world.locks).map((lock) => {
    let status = lock.state;

    if (lock.state === "locked" && lock.mechanism === "key" && lock.keyItemId) {
      status += player.inventory.includes(lock.keyItemId) ? " (key ready)" : " (missing key)";
    }

    if (lock.state === "locked" && lock.mechanism === "puzzle" && lock.puzzleId) {
      status += world.puzzles[lock.puzzleId]?.state === "solved" ? " (puzzle solved)" : " (puzzle pending)";
    }

    return [lock.id, status, getLockConditionDescription(world, lock)];
  });
}

function buildPuzzleRows(world: GameWorld, player: PlayerState): string[][] {
  return Object.values(world.puzzles).map((puzzle) => {
    const missingItems = (puzzle.solution.itemIds ?? []).filter(
      (itemId) => !player.inventory.includes(itemId),
    );
    const missingLabel =
      missingItems.length > 0
        ? missingItems.map((itemId) => world.items[itemId]?.name ?? itemId).join(", ")
        : "ready";

    return [
      puzzle.id,
      puzzle.state,
      world.rooms[puzzle.roomId]?.name ?? puzzle.roomId,
      missingLabel,
      getPuzzleSolutionDescription(world, puzzle),
    ];
  });
}

function buildWinRows(world: GameWorld, player: PlayerState): string[][] {
  const { winCondition } = world;
  const solved =
    winCondition.type === "reach_room"
      ? player.currentRoomId === winCondition.targetId
      : winCondition.type === "solve_puzzle"
        ? world.puzzles[winCondition.targetId]?.state === "solved"
        : winCondition.type === "flag"
          ? player.flags[winCondition.targetId] === true
          : winCondition.targetId
              .split(",")
              .every((itemId) => player.inventory.includes(itemId.trim()));

  return [[winCondition.type, solved ? "complete" : "pending", winCondition.description]];
}

function deriveHintFallback(world: GameWorld, player: PlayerState): string {
  const winCondition: WinCondition = world.winCondition;

  if (winCondition.type === "reach_room") {
    const path = findPath(world, player.currentRoomId, winCondition.targetId, true);
    if (!path || path.length < 2) {
      return winCondition.description;
    }

    for (let index = 1; index < path.length; index += 1) {
      const step = path[index];
      const connection = step.connection;

      if (!connection) {
        continue;
      }

      if (connection.lockId && world.locks[connection.lockId]?.state === "locked") {
        const lock = world.locks[connection.lockId];
        if (lock.mechanism === "puzzle" && lock.puzzleId) {
          const puzzle = world.puzzles[lock.puzzleId];
          if (puzzle) {
            const missingItems = (puzzle.solution.itemIds ?? []).filter(
              (itemId) => !player.inventory.includes(itemId),
            );
            if (missingItems.length > 0) {
              const itemRoom = findItemRoom(world, missingItems[0]);
              if (itemRoom) {
                const itemName = world.items[missingItems[0]]?.name ?? missingItems[0];
                return `You are still missing ${itemName}. Look for it in ${itemRoom.name} before tackling ${puzzle.name}.`;
              }
            }

            if (player.currentRoomId !== puzzle.roomId) {
              const puzzlePath = findPath(world, player.currentRoomId, puzzle.roomId, false);
              const firstMove = puzzlePath?.[1]?.directionFromPrevious;
              const roomName = world.rooms[puzzle.roomId]?.name ?? puzzle.roomId;
              return firstMove
                ? `Head ${firstMove} toward ${roomName}. ${getPuzzleSolutionDescription(world, puzzle)}`
                : `Make your way to ${roomName}. ${getPuzzleSolutionDescription(world, puzzle)}`;
            }

            return getPuzzleSolutionDescription(world, puzzle);
          }
        }

        return getLockConditionDescription(world, lock);
      }
    }

    const firstStep = path[1];
    const destination = world.rooms[firstStep.roomId]?.name ?? firstStep.roomId;
    return `The route ahead is clear enough by local standards. Go ${firstStep.directionFromPrevious} toward ${destination}.`;
  }

  return winCondition.description;
}

export function renderFullMap(world: GameWorld, player: PlayerState): string {
  return [
    "FULL MAP",
    "",
    renderAsciiMap(
      Object.values(world.rooms),
      world.connections,
      Object.keys(world.rooms),
      player.currentRoomId,
    ),
  ].join("\n");
}

export function renderEntityTables(world: GameWorld, player: PlayerState): string {
  const currentRoom = world.rooms[player.currentRoomId]?.name ?? player.currentRoomId;
  const inventory = player.inventory.map((itemId) => world.items[itemId]?.name ?? itemId).join(", ") || "empty";

  return [
    "ENTITY TABLES",
    `Current room: ${currentRoom}`,
    `Inventory: ${inventory}`,
    "",
    "PUZZLES",
    formatTable(["id", "state", "room", "missing", "solution"], buildPuzzleRows(world, player)),
    "",
    "LOCKS",
    formatTable(["id", "state", "condition"], buildLockRows(world, player)),
    "",
    "WIN CONDITION",
    formatTable(["type", "status", "goal"], buildWinRows(world, player)),
  ].join("\n");
}

export function buildHintFallback(world: GameWorld, player: PlayerState): string {
  return deriveHintFallback(world, player);
}
