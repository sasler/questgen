import type { Room, Connection, Direction } from "@/types";

// --- Public types ---

export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface AsciiMapProps {
  rooms: Room[];
  connections: Connection[];
  visitedRoomIds: string[];
  currentRoomId: string;
  roomPositions?: Record<string, { x: number; y: number }>;
}

// --- Constants ---

const MAX_NAME_LEN = 10;
const BOX_INNER = MAX_NAME_LEN; // chars inside brackets
const BOX_WIDTH = BOX_INNER + 2; // including [ ]
const H_CONNECTOR = 3; // "---" or "=X="
const CELL_W = BOX_WIDTH + H_CONNECTOR; // 15
const CELL_H = 2; // room line + connector line

// --- Helpers ---

function truncateName(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 2) + "..";
}

function padCenter(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

/** BFS layout: compute positions for each room starting from currentRoomId. */
function computePositions(
  rooms: Room[],
  connections: Connection[],
  startRoomId: string,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const occupied = new Map<string, string>(); // "x,y" -> roomId

  const roomIds = new Set(rooms.map((r) => r.id));

  // Build adjacency from connections
  const adj = new Map<string, { roomId: string; direction: Direction }[]>();
  for (const conn of connections) {
    if (!roomIds.has(conn.fromRoomId) || !roomIds.has(conn.toRoomId)) continue;
    if (!adj.has(conn.fromRoomId)) adj.set(conn.fromRoomId, []);
    if (!adj.has(conn.toRoomId)) adj.set(conn.toRoomId, []);
    adj.get(conn.fromRoomId)!.push({ roomId: conn.toRoomId, direction: conn.direction });
    adj.get(conn.toRoomId)!.push({ roomId: conn.fromRoomId, direction: conn.reverseDirection });
  }

  const directionOffset: Record<string, { dx: number; dy: number }> = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    east: { dx: 1, dy: 0 },
    west: { dx: -1, dy: 0 },
    up: { dx: 0, dy: 0 },
    down: { dx: 0, dy: 0 },
  };

  // BFS
  const queue: string[] = [];
  const key = (x: number, y: number) => `${x},${y}`;

  // Place start room
  if (roomIds.has(startRoomId)) {
    positions[startRoomId] = { x: 0, y: 0 };
    occupied.set(key(0, 0), startRoomId);
    queue.push(startRoomId);
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentPos = positions[currentId];
    const neighbors = adj.get(currentId) || [];

    for (const { roomId, direction } of neighbors) {
      if (positions[roomId]) continue;

      const offset = directionOffset[direction];
      let nx = currentPos.x + offset.dx;
      let ny = currentPos.y + offset.dy;

      // up/down: try to place nearby if same position occupied
      if (direction === "up" || direction === "down") {
        // Place up/down rooms offset east, then try other offsets
        const tryOffsets = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 },
          { dx: 1, dy: -1 },
          { dx: 1, dy: 1 },
        ];
        let placed = false;
        for (const off of tryOffsets) {
          const tx = currentPos.x + off.dx;
          const ty = currentPos.y + off.dy;
          if (!occupied.has(key(tx, ty))) {
            nx = tx;
            ny = ty;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Fallback: find any free spot
          for (let r = 1; r <= 10; r++) {
            for (let dx = -r; dx <= r; dx++) {
              for (let dy = -r; dy <= r; dy++) {
                if (!occupied.has(key(currentPos.x + dx, currentPos.y + dy))) {
                  nx = currentPos.x + dx;
                  ny = currentPos.y + dy;
                  placed = true;
                  break;
                }
              }
              if (placed) break;
            }
            if (placed) break;
          }
        }
      }

      // Conflict resolution: if position taken, try offsets
      if (occupied.has(key(nx, ny))) {
        const offsets = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
          { dx: 1, dy: 1 },
          { dx: -1, dy: 1 },
          { dx: 1, dy: -1 },
          { dx: -1, dy: -1 },
        ];
        for (const off of offsets) {
          const tx = nx + off.dx;
          const ty = ny + off.dy;
          if (!occupied.has(key(tx, ty))) {
            nx = tx;
            ny = ty;
            break;
          }
        }
      }

      positions[roomId] = { x: nx, y: ny };
      occupied.set(key(nx, ny), roomId);
      queue.push(roomId);
    }
  }

  // Place any remaining rooms not reachable via connections
  for (const room of rooms) {
    if (!positions[room.id]) {
      let placed = false;
      for (let r = 1; r <= 20 && !placed; r++) {
        for (let dx = -r; dx <= r && !placed; dx++) {
          for (let dy = -r; dy <= r && !placed; dy++) {
            if (!occupied.has(key(dx, dy))) {
              positions[room.id] = { x: dx, y: dy };
              occupied.set(key(dx, dy), room.id);
              placed = true;
            }
          }
        }
      }
    }
  }

  return positions;
}

/** Build the connection lookup: which pairs of visited rooms are connected? */
interface RenderedConnection {
  fromId: string;
  toId: string;
  direction: Direction;
  locked: boolean;
}

function getVisibleConnections(
  connections: Connection[],
  visitedSet: Set<string>,
): RenderedConnection[] {
  const result: RenderedConnection[] = [];
  for (const conn of connections) {
    if (conn.hidden) continue;
    if (visitedSet.has(conn.fromRoomId) && visitedSet.has(conn.toRoomId)) {
      result.push({
        fromId: conn.fromRoomId,
        toId: conn.toRoomId,
        direction: conn.direction,
        locked: !!conn.lockId,
      });
    }
  }
  return result;
}

/** Render the ASCII map to a string. */
export function renderAsciiMap(
  rooms: Room[],
  connections: Connection[],
  visitedRoomIds: string[],
  currentRoomId: string,
  roomPositions?: Record<string, { x: number; y: number }>,
): string {
  const visitedSet = new Set(visitedRoomIds);
  const visibleRooms = rooms.filter((r) => visitedSet.has(r.id));

  if (visibleRooms.length === 0) return "";

  // Compute or use provided positions
  const positions =
    roomPositions ?? computePositions(rooms, connections, currentRoomId);

  // Filter positions to only visible rooms
  const visiblePositions: Record<string, { x: number; y: number }> = {};
  for (const room of visibleRooms) {
    if (positions[room.id]) {
      visiblePositions[room.id] = positions[room.id];
    }
  }

  // Normalize: shift so minimum x,y = 0
  let minX = Infinity,
    minY = Infinity;
  for (const pos of Object.values(visiblePositions)) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
  }

  const normalizedPositions: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of Object.entries(visiblePositions)) {
    normalizedPositions[id] = { x: pos.x - minX, y: pos.y - minY };
  }

  // Determine grid size
  let maxX = 0,
    maxY = 0;
  for (const pos of Object.values(normalizedPositions)) {
    maxX = Math.max(maxX, pos.x);
    maxY = Math.max(maxY, pos.y);
  }

  // Character grid dimensions
  const gridW = (maxX + 1) * CELL_W;
  const gridH = (maxY + 1) * CELL_H;

  // Create grid filled with spaces
  const grid: string[][] = [];
  for (let row = 0; row < gridH; row++) {
    grid.push(new Array(gridW).fill(" "));
  }

  // Helper: write string into grid
  const writeAt = (row: number, col: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      const c = col + i;
      if (row >= 0 && row < gridH && c >= 0 && c < gridW) {
        grid[row][c] = text[i];
      }
    }
  };

  // Build room lookup
  const roomMap = new Map(visibleRooms.map((r) => [r.id, r]));

  // Draw rooms
  for (const [id, pos] of Object.entries(normalizedPositions)) {
    const room = roomMap.get(id);
    if (!room) continue;

    const charRow = pos.y * CELL_H;
    const charCol = pos.x * CELL_W;
    const isCurrent = id === currentRoomId;

    let displayName: string;
    if (isCurrent) {
      const truncated = truncateName(room.name, MAX_NAME_LEN - 2);
      displayName = `*${truncated}*`;
    } else {
      displayName = truncateName(room.name, MAX_NAME_LEN);
    }

    const padded = padCenter(displayName, BOX_INNER);
    const box = `[${padded}]`;
    writeAt(charRow, charCol, box);
  }

  // Draw connections
  const visibleConns = getVisibleConnections(connections, visitedSet);
  for (const conn of visibleConns) {
    const fromPos = normalizedPositions[conn.fromId];
    const toPos = normalizedPositions[conn.toId];
    if (!fromPos || !toPos) continue;

    const dir = conn.direction;

    if (dir === "east" || dir === "west") {
      // Horizontal connection
      const leftId = dir === "east" ? conn.fromId : conn.toId;
      const leftPos = normalizedPositions[leftId];
      if (!leftPos) continue;

      const rightPos =
        normalizedPositions[dir === "east" ? conn.toId : conn.fromId];
      if (!rightPos) continue;

      // Draw connector between them
      const row = leftPos.y * CELL_H;
      const startCol = leftPos.x * CELL_W + BOX_WIDTH;
      const endCol = rightPos.x * CELL_W;

      // Fill gap with dashes
      if (endCol > startCol) {
        const connStr = conn.locked ? "=X=" : "---";
        // Draw connector in the middle of the gap
        const gapMid = startCol + Math.floor((endCol - startCol - connStr.length) / 2);
        writeAt(row, gapMid, connStr);
      }
    } else if (dir === "north" || dir === "south") {
      // Vertical connection
      const topId = dir === "south" ? conn.fromId : conn.toId;
      const topPos = normalizedPositions[topId];
      const bottomPos =
        normalizedPositions[dir === "south" ? conn.toId : conn.fromId];
      if (!topPos || !bottomPos) continue;

      const col = topPos.x * CELL_W + Math.floor(BOX_WIDTH / 2);
      const startRow = topPos.y * CELL_H + 1;
      const endRow = bottomPos.y * CELL_H;

      for (let r = startRow; r < endRow; r++) {
        writeAt(r, col, conn.locked ? "X" : "|");
      }
    } else if (dir === "up" || dir === "down") {
      // Up/down: draw a marker on the "from" room
      const fromCharRow = fromPos.y * CELL_H;
      const fromCharCol = fromPos.x * CELL_W + BOX_WIDTH;
      const marker = dir === "up" ? "^" : "v";
      writeAt(fromCharRow, fromCharCol, marker);

      // Also mark on the "to" room
      const toCharRow = toPos.y * CELL_H;
      const toCharCol = toPos.x * CELL_W + BOX_WIDTH;
      const reverseMarker = dir === "up" ? "v" : "^";
      writeAt(toCharRow, toCharCol, reverseMarker);
    }
  }

  // Convert grid to string, trimming trailing spaces per line
  const lines = grid.map((row) => row.join("").replace(/\s+$/, ""));

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

// --- React Component ---

export function AsciiMap({
  rooms,
  connections,
  visitedRoomIds,
  currentRoomId,
  roomPositions,
}: AsciiMapProps) {
  const ascii = renderAsciiMap(
    rooms,
    connections,
    visitedRoomIds,
    currentRoomId,
    roomPositions,
  );

  return (
    <pre
      role="img"
      aria-label="Game map"
      className="font-mono text-sm leading-tight text-green-400"
    >
      {ascii}
    </pre>
  );
}
