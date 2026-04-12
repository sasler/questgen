import { renderAsciiMap } from "@/components/AsciiMap";
import type { Connection, GameWorld, Interactable, Lock, PlayerState, Puzzle, Room, WinCondition } from "@/types";

interface PathStep {
  roomId: string;
  directionFromPrevious?: string;
  connection?: Connection;
}

interface InteractableDebugDetails {
  puzzleTargets: string;
  lockTargets: string;
  status: string;
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

  if (puzzle.solution.targetInteractableId) {
    const interactable =
      world.interactables[puzzle.solution.targetInteractableId]?.name ??
      puzzle.solution.targetInteractableId;
    parts.push(`on ${interactable}`);
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
    const interactable = lock.targetInteractableId
      ? world.interactables[lock.targetInteractableId]?.name ?? lock.targetInteractableId
      : "this lock";
    return `Solve ${puzzleName} to unlock ${interactable}.`;
  }

  return "Change the required NPC state to unlock this lock.";
}

function formatItemNames(world: GameWorld, itemIds: string[]): string {
  return itemIds.map((itemId) => world.items[itemId]?.name ?? itemId).join(", ");
}

function formatInteractableTarget(
  world: GameWorld,
  interactableId?: string,
  targetState?: string,
): string {
  if (!interactableId) {
    return "—";
  }

  const interactable = world.interactables[interactableId];
  const name = interactable?.name ?? interactableId;
  return targetState ? `${name} ${interactable?.state ?? "?"} → ${targetState}` : name;
}

function getPuzzleRequirementLabel(world: GameWorld, puzzle: Puzzle): string {
  const parts = [puzzle.solution.action];

  if ((puzzle.solution.itemIds ?? []).length > 0) {
    parts.push(formatItemNames(world, puzzle.solution.itemIds ?? []));
  }

  if (puzzle.solution.npcId) {
    parts.push(world.npcs[puzzle.solution.npcId]?.name ?? puzzle.solution.npcId);
  }

  return parts.join(" + ");
}

function getPuzzleStatusLabel(world: GameWorld, player: PlayerState, puzzle: Puzzle): string {
  const missingItems = (puzzle.solution.itemIds ?? []).filter(
    (itemId) => !player.inventory.includes(itemId),
  );
  const status: string[] = [];

  if (puzzle.state === "solved") {
    status.push("solved");
  }

  if (missingItems.length > 0) {
    status.push(`missing ${formatItemNames(world, missingItems)}`);
  } else if ((puzzle.solution.itemIds ?? []).length > 0) {
    status.push("items ready");
  }

  if (puzzle.solution.targetInteractableId) {
    const interactable = world.interactables[puzzle.solution.targetInteractableId];
    if (interactable) {
      status.push(
        puzzle.solution.targetState
          ? `${interactable.name} is ${interactable.state} (needs ${puzzle.solution.targetState})`
          : `${interactable.name} is ${interactable.state}`,
      );
    }
  }

  return status.join("; ") || "ready";
}

function getLockDependencyLabel(world: GameWorld, lock: Lock): string {
  if (lock.mechanism === "key") {
    const itemName = lock.keyItemId ? world.items[lock.keyItemId]?.name ?? lock.keyItemId : "unknown key";
    return `key: ${itemName}`;
  }

  if (lock.mechanism === "puzzle") {
    const puzzleName = lock.puzzleId ? world.puzzles[lock.puzzleId]?.name ?? lock.puzzleId : "unknown puzzle";
    return `puzzle: ${puzzleName}`;
  }

  return "npc state";
}

function getLockStatusLabel(world: GameWorld, player: PlayerState, lock: Lock): string {
  if (lock.state === "unlocked") {
    return "unlocked";
  }

  if (lock.mechanism === "key" && lock.keyItemId) {
    const itemName = world.items[lock.keyItemId]?.name ?? lock.keyItemId;
    return player.inventory.includes(lock.keyItemId)
      ? `${itemName} ready`
      : `missing ${itemName}`;
  }

  if (lock.mechanism === "puzzle" && lock.puzzleId) {
    const puzzle = world.puzzles[lock.puzzleId];
    if (!puzzle) {
      return "missing linked puzzle";
    }

    return puzzle.state === "solved"
      ? `${puzzle.name} solved`
      : `waiting for ${puzzle.name}; ${getPuzzleStatusLabel(world, player, puzzle)}`;
  }

  return "waiting on NPC state";
}

function getInteractableDebugDetails(
  world: GameWorld,
  player: PlayerState,
  interactable: Interactable,
): InteractableDebugDetails {
  const puzzleTargets = Object.values(world.puzzles).filter(
    (puzzle) => puzzle.solution.targetInteractableId === interactable.id,
  );
  const lockTargets = Object.values(world.locks).filter(
    (lock) => lock.targetInteractableId === interactable.id,
  );

  return {
    puzzleTargets:
      puzzleTargets
        .map((puzzle) => `${puzzle.name} (${puzzle.state}) → ${puzzle.solution.targetState ?? "?"}`)
        .join("; ") || "—",
    lockTargets:
      lockTargets
        .map((lock) => `${lock.id} (${getLockDependencyLabel(world, lock)}) → ${lock.unlockedState ?? "?"}`)
        .join("; ") || "—",
    status:
      [
        ...puzzleTargets.map((puzzle) => getPuzzleStatusLabel(world, player, puzzle)),
        ...lockTargets.map((lock) => getLockStatusLabel(world, player, lock)),
      ]
        .filter(Boolean)
        .join(" | ") || `state: ${interactable.state}`,
  };
}

function buildCurrentRoomInteractableRows(world: GameWorld, player: PlayerState): string[][] {
  const currentRoomId = player.currentRoomId;

  return Object.values(world.interactables)
    .filter((interactable) => interactable.roomId === currentRoomId)
    .map((interactable) => {
      const details = getInteractableDebugDetails(world, player, interactable);
      return [
        interactable.id,
        interactable.name,
        interactable.state,
        interactable.aliases.join(", "),
        details.puzzleTargets,
        details.lockTargets,
        details.status,
      ];
    });
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
    return [
      lock.id,
      lock.state,
      formatInteractableTarget(world, lock.targetInteractableId, lock.unlockedState),
      getLockDependencyLabel(world, lock),
      getLockStatusLabel(world, player, lock),
      getLockConditionDescription(world, lock),
    ];
  });
}

function buildPuzzleRows(world: GameWorld, player: PlayerState): string[][] {
  return Object.values(world.puzzles).map((puzzle) => {
    return [
      puzzle.id,
      puzzle.state,
      world.rooms[puzzle.roomId]?.name ?? puzzle.roomId,
      formatInteractableTarget(
        world,
        puzzle.solution.targetInteractableId,
        puzzle.solution.targetState,
      ),
      getPuzzleRequirementLabel(world, puzzle),
      getPuzzleStatusLabel(world, player, puzzle),
      getPuzzleSolutionDescription(world, puzzle),
    ];
  });
}

function buildInteractableRows(world: GameWorld, player: PlayerState): string[][] {
  return Object.values(world.interactables).map((interactable: Interactable) => {
    const details = getInteractableDebugDetails(world, player, interactable);

    return [
      interactable.id,
      interactable.name,
      interactable.state,
      world.rooms[interactable.roomId]?.name ?? interactable.roomId,
      interactable.aliases.join(", "),
      details.puzzleTargets,
      details.lockTargets,
      details.status,
      interactable.description,
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
    "CURRENT ROOM INTERACTABLES",
    formatTable(
      ["id", "name", "state", "aliases", "puzzle targets", "lock targets", "status"],
      buildCurrentRoomInteractableRows(world, player),
    ),
    "",
    "PUZZLES",
    formatTable(
      ["id", "state", "room", "target", "required", "status", "solution"],
      buildPuzzleRows(world, player),
    ),
    "",
    "LOCKS",
    formatTable(
      ["id", "state", "target", "dependency", "status", "condition"],
      buildLockRows(world, player),
    ),
    "",
    "WORLD INTERACTABLES",
    formatTable(
      [
        "id",
        "name",
        "state",
        "room",
        "aliases",
        "puzzle targets",
        "lock targets",
        "status",
        "description",
      ],
      buildInteractableRows(world, player),
    ),
    "",
    "WIN CONDITION",
    formatTable(["type", "status", "goal"], buildWinRows(world, player)),
  ].join("\n");
}

export function buildRoomInteractableHintLines(
  world: GameWorld,
  player: PlayerState,
): string[] {
  return Object.values(world.interactables)
    .filter((interactable) => interactable.roomId === player.currentRoomId)
    .map((interactable) => {
      const details = getInteractableDebugDetails(world, player, interactable);
      return `- ${interactable.name} (${interactable.id}): ${interactable.description} [state: ${interactable.state}; aliases: ${interactable.aliases.join(", ")}; puzzles: ${details.puzzleTargets}; locks: ${details.lockTargets}; status: ${details.status}]`;
    });
}

export function buildHintFallback(world: GameWorld, player: PlayerState): string {
  return deriveHintFallback(world, player);
}
