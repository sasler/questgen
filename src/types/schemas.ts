import { z } from "zod";

// ── Direction ───────────────────────────────────────────────────────

export const DirectionSchema = z.enum([
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
]);

// ── Room ────────────────────────────────────────────────────────────

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  itemIds: z.array(z.string()),
  npcIds: z.array(z.string()),
  firstVisitText: z.string().optional(),
});

// ── Item ────────────────────────────────────────────────────────────

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  portable: z.boolean(),
  usableWith: z.array(z.string()).optional(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

// ── NPC ─────────────────────────────────────────────────────────────

export const NPCSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  dialogue: z.record(z.string(), z.string()),
  state: z.string(),
});

// ── Connection ──────────────────────────────────────────────────────

export const ConnectionSchema = z.object({
  fromRoomId: z.string(),
  toRoomId: z.string(),
  direction: DirectionSchema,
  reverseDirection: DirectionSchema,
  lockId: z.string().optional(),
  hidden: z.boolean().optional(),
  description: z.string().optional(),
});

// ── Puzzle ───────────────────────────────────────────────────────────

export const PuzzleSolutionSchema = z.object({
  action: z.string(),
  itemIds: z.array(z.string()).optional(),
  npcId: z.string().optional(),
});

export const PuzzleRewardSchema = z.object({
  type: z.enum(["unlock", "item", "flag", "npc_state"]),
  targetId: z.string(),
  value: z.string().optional(),
});

export const PuzzleSchema = z.object({
  id: z.string(),
  name: z.string(),
  roomId: z.string(),
  description: z.string(),
  state: z.enum(["unsolved", "solved"]),
  solution: PuzzleSolutionSchema,
  reward: PuzzleRewardSchema,
});

// ── Lock ────────────────────────────────────────────────────────────

export const LockSchema = z.object({
  id: z.string(),
  state: z.enum(["locked", "unlocked"]),
  mechanism: z.enum(["key", "puzzle", "npc"]),
  keyItemId: z.string().optional(),
  puzzleId: z.string().optional(),
});

// ── WinCondition ────────────────────────────────────────────────────

export const WinConditionSchema = z.object({
  type: z.enum(["reach_room", "collect_items", "solve_puzzle", "flag"]),
  targetId: z.string(),
  description: z.string(),
});

// ── GameWorld ────────────────────────────────────────────────────────

export const GameWorldSchema = z.object({
  rooms: z.record(z.string(), RoomSchema),
  items: z.record(z.string(), ItemSchema),
  npcs: z.record(z.string(), NPCSchema),
  connections: z.array(ConnectionSchema),
  puzzles: z.record(z.string(), PuzzleSchema),
  locks: z.record(z.string(), LockSchema),
  winCondition: WinConditionSchema,
  startRoomId: z.string(),
});

// ── PlayerState ─────────────────────────────────────────────────────

export const PlayerStateSchema = z.object({
  currentRoomId: z.string(),
  inventory: z.array(z.string()),
  visitedRooms: z.array(z.string()),
  flags: z.record(z.string(), z.boolean()),
  turnCount: z.number().int().nonnegative(),
  stateVersion: z.number().int().nonnegative(),
});

// ── TurnEntry ───────────────────────────────────────────────────────

export const TurnEntrySchema = z.object({
  turnId: z.string(),
  role: z.enum(["player", "narrator"]),
  text: z.string(),
  timestamp: z.number(),
});

// ── GameSize ────────────────────────────────────────────────────────

export const GameSizeSchema = z.enum(["small", "medium", "large", "epic"]);

// ── GameSettings ────────────────────────────────────────────────────

export const ByokConfigSchema = z.object({
  type: z.enum(["openai", "azure", "anthropic"]),
  baseUrl: z.string(),
});

export const GameSettingsSchema = z.object({
  generationModel: z.string(),
  gameplayModel: z.string(),
  responseLength: z.enum(["brief", "moderate", "detailed"]),
  provider: z.enum(["copilot", "byok"]),
  byokConfig: ByokConfigSchema.optional(),
});

// ── GameMetadata ────────────────────────────────────────────────────

export const GameMetadataSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string(),
  size: GameSizeSchema,
  createdAt: z.number(),
  lastPlayedAt: z.number(),
  turnCount: z.number().int().nonnegative(),
  completed: z.boolean(),
});

// ── ProposedAction (discriminated union) ────────────────────────────

const MoveActionSchema = z.object({
  type: z.literal("move"),
  direction: DirectionSchema,
});

const PickupActionSchema = z.object({
  type: z.literal("pickup"),
  itemId: z.string(),
});

const DropActionSchema = z.object({
  type: z.literal("drop"),
  itemId: z.string(),
});

const UseItemActionSchema = z.object({
  type: z.literal("use_item"),
  itemId: z.string(),
  targetId: z.string(),
});

const UnlockActionSchema = z.object({
  type: z.literal("unlock"),
  lockId: z.string(),
  itemId: z.string().optional(),
});

const SolvePuzzleActionSchema = z.object({
  type: z.literal("solve_puzzle"),
  puzzleId: z.string(),
  action: z.string(),
  itemIds: z.array(z.string()).optional(),
});

const TalkNpcActionSchema = z.object({
  type: z.literal("talk_npc"),
  npcId: z.string(),
});

const NpcStateChangeActionSchema = z.object({
  type: z.literal("npc_state_change"),
  npcId: z.string(),
  newState: z.string(),
});

const SetFlagActionSchema = z.object({
  type: z.literal("set_flag"),
  flag: z.string(),
  value: z.boolean(),
});

const RevealConnectionActionSchema = z.object({
  type: z.literal("reveal_connection"),
  fromRoomId: z.string(),
  toRoomId: z.string(),
});

const AddItemToRoomActionSchema = z.object({
  type: z.literal("add_item_to_room"),
  itemId: z.string(),
  roomId: z.string(),
});

const RemoveItemFromRoomActionSchema = z.object({
  type: z.literal("remove_item_from_room"),
  itemId: z.string(),
  roomId: z.string(),
});

export const ProposedActionSchema = z.discriminatedUnion("type", [
  MoveActionSchema,
  PickupActionSchema,
  DropActionSchema,
  UseItemActionSchema,
  UnlockActionSchema,
  SolvePuzzleActionSchema,
  TalkNpcActionSchema,
  NpcStateChangeActionSchema,
  SetFlagActionSchema,
  RevealConnectionActionSchema,
  AddItemToRoomActionSchema,
  RemoveItemFromRoomActionSchema,
]);

// ── AITurnResponse ──────────────────────────────────────────────────

export const AITurnResponseSchema = z.object({
  narrative: z.string(),
  proposedActions: z.array(ProposedActionSchema),
});

// ── GameGenerationRequest ───────────────────────────────────────────

export const GameGenerationRequestSchema = z.object({
  description: z.string().min(1),
  size: GameSizeSchema,
  genre: z.string().optional(),
});

// ── GameState ───────────────────────────────────────────────────────

export const GameStateSchema = z.object({
  metadata: GameMetadataSchema,
  world: GameWorldSchema,
  player: PlayerStateSchema,
  history: z.array(TurnEntrySchema),
  settings: GameSettingsSchema,
});

// ── Inferred types ──────────────────────────────────────────────────

export type DirectionZ = z.infer<typeof DirectionSchema>;
export type RoomZ = z.infer<typeof RoomSchema>;
export type ItemZ = z.infer<typeof ItemSchema>;
export type NPCZ = z.infer<typeof NPCSchema>;
export type ConnectionZ = z.infer<typeof ConnectionSchema>;
export type PuzzleZ = z.infer<typeof PuzzleSchema>;
export type LockZ = z.infer<typeof LockSchema>;
export type WinConditionZ = z.infer<typeof WinConditionSchema>;
export type GameWorldZ = z.infer<typeof GameWorldSchema>;
export type PlayerStateZ = z.infer<typeof PlayerStateSchema>;
export type TurnEntryZ = z.infer<typeof TurnEntrySchema>;
export type GameSizeZ = z.infer<typeof GameSizeSchema>;
export type GameSettingsZ = z.infer<typeof GameSettingsSchema>;
export type GameMetadataZ = z.infer<typeof GameMetadataSchema>;
export type ProposedActionZ = z.infer<typeof ProposedActionSchema>;
export type AITurnResponseZ = z.infer<typeof AITurnResponseSchema>;
export type GameGenerationRequestZ = z.infer<typeof GameGenerationRequestSchema>;
export type GameStateZ = z.infer<typeof GameStateSchema>;
