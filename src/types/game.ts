// Direction enum
export type Direction = "north" | "south" | "east" | "west" | "up" | "down";

// Room
export interface Room {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
  npcIds: string[];
  firstVisitText?: string;
}

// Item
export interface Item {
  id: string;
  name: string;
  description: string;
  portable: boolean;
  usableWith?: string[];
  properties: Record<string, string | number | boolean>;
}

// NPC
export interface NPC {
  id: string;
  name: string;
  description: string;
  dialogue: Record<string, string>;
  state: string;
}

// Interactable room object
export interface Interactable {
  id: string;
  roomId: string;
  name: string;
  description: string;
  aliases: string[];
  state: string;
  properties: Record<string, string | number | boolean>;
}

// Connection between rooms
export interface Connection {
  fromRoomId: string;
  toRoomId: string;
  direction: Direction;
  reverseDirection: Direction;
  lockId?: string;
  hidden?: boolean;
  description?: string;
}

// Puzzle
export interface Puzzle {
  id: string;
  name: string;
  roomId: string;
  description: string;
  state: "unsolved" | "solved";
  solution: {
    action: string;
    itemIds?: string[];
    npcId?: string;
    targetInteractableId?: string;
    targetState?: string;
    description?: string;
  };
  reward: {
    type: "unlock" | "item" | "flag" | "npc_state";
    targetId: string;
    value?: string;
  };
}

// Lock
export interface Lock {
  id: string;
  state: "locked" | "unlocked";
  mechanism: "key" | "puzzle" | "npc";
  keyItemId?: string;
  puzzleId?: string;
  targetInteractableId?: string;
  unlockedState?: string;
  conditionDescription?: string;
}

// Win condition
export interface WinCondition {
  type: "reach_room" | "collect_items" | "solve_puzzle" | "flag";
  targetId: string;
  description: string;
}

// The full game world (mostly immutable after generation)
export interface GameWorld {
  rooms: Record<string, Room>;
  items: Record<string, Item>;
  npcs: Record<string, NPC>;
  interactables: Record<string, Interactable>;
  connections: Connection[];
  puzzles: Record<string, Puzzle>;
  locks: Record<string, Lock>;
  winCondition: WinCondition;
  startRoomId: string;
}

// Mutable player state
export interface PlayerState {
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  flags: Record<string, boolean>;
  turnCount: number;
  stateVersion: number;
}

// Turn entry in history
export interface TurnEntry {
  turnId: string;
  role: "player" | "narrator";
  text: string;
  timestamp: number;
}

// Game size presets
export type GameSize = "small" | "medium" | "large" | "epic";

// Game settings
export interface GameSettings {
  generationModel: string;
  gameplayModel: string;
  responseLength: "brief" | "moderate" | "detailed";
  provider: "copilot" | "byok";
  byokConfig?: {
    type: "openai" | "azure" | "anthropic";
    baseUrl: string;
  };
}

// Game metadata (stored in user's game index)
export interface GameMetadata {
  id: string;
  userId: string;
  title: string;
  description: string;
  size: GameSize;
  createdAt: number;
  lastPlayedAt: number;
  turnCount: number;
  completed: boolean;
  generationSeed?: string;
}

// Full game state (assembled from split KV storage)
export interface GameState {
  metadata: GameMetadata;
  world: GameWorld;
  player: PlayerState;
  history: TurnEntry[];
  settings: GameSettings;
}

// AI response format for turn processing
export interface AITurnResponse {
  narrative: string;
  proposedActions: ProposedAction[];
}

// Actions the AI can propose (validated by deterministic engine)
export type ProposedAction =
  | { type: "move"; direction: Direction }
  | { type: "pickup"; itemId: string }
  | { type: "drop"; itemId: string }
  | { type: "use_item"; itemId: string; targetId: string }
  | { type: "unlock"; lockId: string; itemId?: string }
  | { type: "solve_puzzle"; puzzleId: string; action: string; itemIds?: string[] }
  | { type: "talk_npc"; npcId: string }
  | { type: "npc_state_change"; npcId: string; newState: string }
  | { type: "set_flag"; flag: string; value: boolean }
  | { type: "reveal_connection"; fromRoomId: string; toRoomId: string }
  | { type: "add_item_to_room"; itemId: string; roomId: string }
  | { type: "remove_item_from_room"; itemId: string; roomId: string };

// Game generation request
export interface GameGenerationRequest {
  description: string;
  size: GameSize;
  genre?: string;
}
