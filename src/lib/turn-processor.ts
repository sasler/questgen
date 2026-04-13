import type {
  Direction,
  GameWorld,
  PlayerState,
  TurnEntry,
  GameSettings,
  AITurnResponse,
  ProposedAction,
  Item,
  Interactable,
} from "@/types";
import { AITurnResponseSchema } from "@/types";
import { applyAction, checkWinCondition, buildLocalContext } from "@/engine";
import type { ActionResult } from "@/engine/game-engine";
import {
  buildNarrativePrompt,
  buildTurnPrompt,
  GAMEPLAY_SYSTEM_PROMPT,
  VALIDATED_NARRATION_SYSTEM_PROMPT,
} from "@/prompts";
import { getAIProvider } from "@/providers";
import type { IAIProvider, AIProviderConfig } from "@/providers/types";
import { createBufferedNarrativeStream } from "@/lib/narrative-stream";
import { GameStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";

// ── Types ───────────────────────────────────────────────────────────

export interface TurnResult {
  success: boolean;
  narrative: string;
  actionResults: ActionResult[];
  newPlayerState: PlayerState;
  worldChanged: boolean;
  gameWon: boolean;
  error?: string;
}

const FALLBACK_NARRATIVE =
  "The universe momentarily lost track of what was happening. Try again.";

// ── JSON extraction ─────────────────────────────────────────────────

function extractJSON(raw: string): string | null {
  // Strip markdown code fences
  const stripped = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;

  return stripped.substring(first, last + 1);
}

function parseAIResponse(raw: string): AITurnResponse | null {
  const json = extractJSON(raw);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    const validated = AITurnResponseSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

const DIRECTION_ALIASES: Record<string, Direction> = {
  n: "north",
  north: "north",
  s: "south",
  south: "south",
  e: "east",
  east: "east",
  w: "west",
  west: "west",
  u: "up",
  up: "up",
  d: "down",
  down: "down",
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?:^| )${escapeRegExp(phrase)}(?:$| )`).test(text);
}

function buildItemPhrases(item: Item): string[] {
  const phrases = new Set<string>();
  const addPhrase = (value?: string) => {
    const normalized = normalizeText(value ?? "");
    if (normalized.length > 0) {
      phrases.add(normalized);
    }
  };

  addPhrase(item.id);
  addPhrase(item.name);

  for (const token of normalizeText(item.name).split(" ")) {
    if (token.length >= 4) {
      phrases.add(token);
    }
  }

  for (const token of normalizeText(item.id).split(" ")) {
    if (token.length >= 4) {
      phrases.add(token);
    }
  }

  return [...phrases];
}

function buildInteractablePhrases(interactable: Interactable): string[] {
  const phrases = new Set<string>();

  for (const value of [
    interactable.id,
    interactable.name,
    ...interactable.aliases,
  ]) {
    const normalized = normalizeText(value);
    if (normalized.length > 0) {
      phrases.add(normalized);
    }
  }

  for (const token of normalizeText(interactable.name).split(" ")) {
    if (token.length >= 4) {
      phrases.add(token);
    }
  }

  return [...phrases];
}

function scorePhraseMatch(
  input: string,
  candidatePhrases: string[],
): number {
  let bestScore = 0;

  for (const phrase of candidatePhrases) {
    if (!containsNormalizedPhrase(input, phrase)) {
      continue;
    }

    const phraseWordCount = phrase.split(" ").length;
    const score = phrase.length * 10 + phraseWordCount;
    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

function resolveReferencedItem(
  fragment: string,
  world: GameWorld,
  player: PlayerState,
): Item | null {
  const normalizedFragment = normalizeText(fragment);
  if (!normalizedFragment) {
    return null;
  }

  const candidateIds = new Set<string>([
    ...player.inventory,
  ]);
  let bestItem: Item | null = null;
  let bestScore = 0;

  for (const itemId of candidateIds) {
    const item = world.items[itemId];
    if (!item) {
      continue;
    }

    const score = scorePhraseMatch(normalizedFragment, buildItemPhrases(item));
    if (score > bestScore) {
      bestItem = item;
      bestScore = score;
    }
  }

  return bestItem;
}

function resolveReferencedInteractable(
  fragment: string,
  world: GameWorld,
  player: PlayerState,
): Interactable | null {
  const normalizedFragment = normalizeText(fragment);
  if (!normalizedFragment) {
    return null;
  }

  let bestInteractable: Interactable | null = null;
  let bestScore = 0;

  for (const interactable of Object.values(world.interactables)) {
    if (interactable.roomId !== player.currentRoomId) {
      continue;
    }

    const score = scorePhraseMatch(
      normalizedFragment,
      buildInteractablePhrases(interactable),
    );
    if (score > bestScore) {
      bestInteractable = interactable;
      bestScore = score;
    }
  }

  return bestInteractable;
}

function resolveDeterministicAction(
  playerInput: string,
  world: GameWorld,
  player: PlayerState,
): ProposedAction | null {
  const normalizedInput = normalizeText(playerInput);
  if (!normalizedInput) {
    return null;
  }

  const directionMatch = normalizedInput.match(
    /^(?:(?:go|move|walk|head|travel|run|step|climb)\s+)?(north|south|east|west|up|down|n|s|e|w|u|d)$/
  );
  if (directionMatch) {
    return {
      type: "move",
      direction: DIRECTION_ALIASES[directionMatch[1]],
    };
  }

  const itemFirstMatch = normalizedInput.match(
    /^(?:use|apply|install|place|put|repair|fix|activate|calibrate)\s+(.+?)\s+(?:on|with|to|into)\s+(.+)$/
  );
  if (itemFirstMatch) {
    const item = resolveReferencedItem(itemFirstMatch[1], world, player);
    const interactable = resolveReferencedInteractable(
      itemFirstMatch[2],
      world,
      player,
    );
    if (item && interactable) {
      return { type: "use_item", itemId: item.id, targetId: interactable.id };
    }
  }

  const targetFirstMatch = normalizedInput.match(
    /^(?:repair|fix|activate|calibrate)\s+(.+?)\s+(?:with|using)\s+(.+)$/
  );
  if (targetFirstMatch) {
    const interactable = resolveReferencedInteractable(
      targetFirstMatch[1],
      world,
      player,
    );
    const item = resolveReferencedItem(targetFirstMatch[2], world, player);
    if (item && interactable) {
      return { type: "use_item", itemId: item.id, targetId: interactable.id };
    }
  }

  return null;
}

const WORLD_MUTATION_CHANGE_TYPES = new Set([
  "item_picked_up",
  "item_dropped",
  "lock_unlocked",
  "puzzle_solved",
  "interactable_state_changed",
  "npc_state_changed",
  "connection_revealed",
  "item_added_to_room",
  "item_removed_from_room",
]);

function hasWorldChanged(actionResults: ActionResult[]): boolean {
  return actionResults.some((result) =>
    result.stateChanges.some((change) => WORLD_MUTATION_CHANGE_TYPES.has(change.type)),
  );
}

function buildDeterministicNarrative(
  actionResults: ActionResult[],
  currentWorld: GameWorld,
  currentPlayer: PlayerState,
  gameWon: boolean,
): string {
  const summaries = actionResults
    .map((result) => result.message.trim())
    .filter((message) => message.length > 0);

  if (gameWon) {
    summaries.push("Against the statistical expectations of nearly everyone, you have won.");
  }

  if (summaries.length > 0) {
    return summaries.join(" ");
  }

  return (
    currentWorld.rooms[currentPlayer.currentRoomId]?.description ??
    "Reality remains in place, which is reassuring if disappointingly uneventful."
  );
}

function buildValidatedNarrationContext(
  world: GameWorld,
  player: PlayerState,
  history: TurnEntry[],
): string {
  const localContext = buildLocalContext(world, player, history);
  const lines = [
    `Current room: ${localContext.currentRoom.name}`,
    `Room description: ${localContext.currentRoom.description}`,
  ];

  if (localContext.nearbyRooms.length > 0) {
    lines.push(
      "",
      "Visible exits:",
      ...localContext.nearbyRooms.map(
        (nearbyRoom) =>
          `- ${nearbyRoom.direction} to ${nearbyRoom.room.name}${nearbyRoom.locked ? " [locked]" : ""}`,
      ),
    );
  }

  lines.push(
    "",
    "Inventory:",
    ...(localContext.inventoryItems.length > 0
      ? localContext.inventoryItems.map((item) => `- ${item.name}`)
      : ["- Empty"]),
  );

  if (localContext.roomItems.length > 0) {
    lines.push(
      "",
      "Items in room:",
      ...localContext.roomItems.map((item) => `- ${item.name}: ${item.description}`),
    );
  }

  if (localContext.roomNPCs.length > 0) {
    lines.push(
      "",
      "NPCs present:",
      ...localContext.roomNPCs.map(
        (npc) => `- ${npc.name}: ${npc.description} [state: ${npc.state}]`,
      ),
    );
  }

  if (localContext.roomInteractables.length > 0) {
    lines.push(
      "",
      "Interactables in room:",
      ...localContext.roomInteractables.map(
        (interactable) =>
          `- ${interactable.name}: ${interactable.description} [state: ${interactable.state}; aliases: ${interactable.aliases.join(", ")}]`,
      ),
    );
  }

  if (localContext.activePuzzles.length > 0) {
    lines.push(
      "",
      "Active puzzles:",
      ...localContext.activePuzzles.map((puzzle) => `- ${puzzle.name}: ${puzzle.description}`),
    );
  }

  return lines.join("\n");
}

function buildValidatedNarrationEvent(
  playerInput: string,
  actionResults: ActionResult[],
  previousWorld: GameWorld,
  previousPlayer: PlayerState,
  currentWorld: GameWorld,
  currentPlayer: PlayerState,
  gameWon: boolean,
): string {
  const lines = [`Player input: ${playerInput}`];

  if (actionResults.length > 0) {
    lines.push(
      "",
      "Validated action outcomes:",
      ...actionResults.map(
        (result, index) =>
          `${index + 1}. ${result.success ? "SUCCESS" : "FAILURE"} - ${result.message}`,
      ),
    );
  } else {
    lines.push("", "Validated action outcomes:", "1. No state-changing action was applied.");
  }

  if (gameWon) {
    lines.push("", "Game outcome: the player has just satisfied the win condition.");
  }

  const moveChanges = actionResults.flatMap((result) =>
    result.stateChanges
      .filter((change) => change.type === "player_moved")
      .map((change) => ({
        success: result.success,
        details: change.details,
      })),
  );

  if (moveChanges.length > 0) {
    lines.push("", "Authoritative movement outcomes:");
    for (const moveChange of moveChanges) {
      const fromRoomId =
        typeof moveChange.details.from === "string"
          ? moveChange.details.from
          : previousPlayer.currentRoomId;
      const toRoomId =
        typeof moveChange.details.to === "string"
          ? moveChange.details.to
          : currentPlayer.currentRoomId;
      const direction =
        typeof moveChange.details.direction === "string"
          ? moveChange.details.direction
          : "unknown";
      const fromRoomName = previousWorld.rooms[fromRoomId]?.name ?? fromRoomId;
      const toRoomName = currentWorld.rooms[toRoomId]?.name ?? toRoomId;
      lines.push(
        `- ${moveChange.success ? "SUCCESS" : "FAILURE"}: player moved ${direction} from ${fromRoomName} (${fromRoomId}) to ${toRoomName} (${toRoomId}).`,
      );
    }
  }

  lines.push("", "Narrate only what actually happened.");
  return lines.join("\n");
}

function narrativeContradictsSuccessfulMovement(
  narrative: string,
  actionResults: ActionResult[],
): boolean {
  const hasSuccessfulMove = actionResults.some(
    (result) =>
      result.success &&
      result.stateChanges.some((change) => change.type === "player_moved"),
  );

  if (!hasSuccessfulMove) {
    return false;
  }

  const normalized = normalizeText(narrative);
  const contradictionPatterns = [
    "already here",
    "already in",
    "already at",
    "no exit",
    "can t go",
    "cannot go",
    "did not move",
    "does not move",
    "movement failed",
    "door is locked",
    "exit is locked",
    "way is locked",
    "passage is locked",
    "bulkhead is locked",
    "remains locked",
    "still locked",
    "rebuffed",
    "path is blocked",
    "way is blocked",
    "going nowhere",
  ];

  return contradictionPatterns.some((pattern) =>
    containsNormalizedPhrase(normalized, pattern),
  );
}

async function generateValidatedNarrative(
  ai: IAIProvider,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  playerInput: string,
  actionResults: ActionResult[],
  previousWorld: GameWorld,
  previousPlayer: PlayerState,
  currentWorld: GameWorld,
  currentPlayer: PlayerState,
  history: TurnEntry[],
  gameWon: boolean,
  onNarrativeChunk?: (chunk: string) => void,
): Promise<string> {
  const deterministicNarrative = buildDeterministicNarrative(
    actionResults,
    currentWorld,
    currentPlayer,
    gameWon,
  );

  try {
    const narrationPrompt = buildNarrativePrompt(
      buildValidatedNarrationContext(currentWorld, currentPlayer, history),
      buildValidatedNarrationEvent(
        playerInput,
        actionResults,
        previousWorld,
        previousPlayer,
        currentWorld,
        currentPlayer,
        gameWon,
      ),
    );
    const completion = onNarrativeChunk
      ? await ai.streamCompletion(
          narrationPrompt,
          {
            model: settings.gameplayModel,
            systemMessage: VALIDATED_NARRATION_SYSTEM_PROMPT,
          },
          aiConfig,
          onNarrativeChunk,
        )
      : await ai.generateCompletion(
          narrationPrompt,
          {
            model: settings.gameplayModel,
            systemMessage: VALIDATED_NARRATION_SYSTEM_PROMPT,
          },
          aiConfig,
        );

    const narrative = completion.content.trim();
    const parsedNarrative = parseAIResponse(narrative)?.narrative?.trim();
    if (parsedNarrative && parsedNarrative.length > 0) {
      if (narrativeContradictsSuccessfulMovement(parsedNarrative, actionResults)) {
        return deterministicNarrative;
      }
      return parsedNarrative;
    }

    if (narrative.length > 0) {
      if (narrativeContradictsSuccessfulMovement(narrative, actionResults)) {
        return deterministicNarrative;
      }
      return narrative;
    }

    return deterministicNarrative;
  } catch {
    return deterministicNarrative;
  }
}

// ── Error result helper ─────────────────────────────────────────────

function errorResult(
  message: string,
  player?: PlayerState,
): TurnResult {
  return {
    success: false,
    narrative: "",
    actionResults: [],
    newPlayerState: player ?? {
      currentRoomId: "",
      inventory: [],
      visitedRooms: [],
      flags: {},
      turnCount: 0,
      stateVersion: 0,
    },
    worldChanged: false,
    gameWon: false,
    error: message,
  };
}

// ── Main pipeline ───────────────────────────────────────────────────

export async function processTurn(
  gameId: string,
  playerInput: string,
  turnId: string,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  storage?: IGameStorage,
  provider?: IAIProvider,
  onNarrativeChunk?: (chunk: string) => void,
): Promise<TurnResult> {
  const store = storage ?? new GameStorage();
  const ai = provider ?? getAIProvider();

  // ── 1. Load state ───────────────────────────────────────────────
  let world: GameWorld;
  let player: PlayerState;
  let history: TurnEntry[];

  try {
    const [loadedWorld, loadedPlayer, loadedHistory, metadata] = await Promise.all([
      store.getWorld(gameId),
      store.getPlayerState(gameId),
      store.getHistory(gameId),
      store.getMetadata(gameId),
    ]);

    if (!loadedWorld) return errorResult("Game world not found");
    if (!loadedPlayer) return errorResult("Player state not found");
    if (!metadata) return errorResult("Game metadata not found");

    world = loadedWorld;
    player = loadedPlayer;
    history = loadedHistory;
  } catch (err) {
    return errorResult(
      err instanceof Error ? err.message : "Failed to load game state",
    );
  }

  const originalVersion = player.stateVersion;

  // ── 2. Build local context ──────────────────────────────────────

  const localContext = buildLocalContext(world, player, history);

  // ── 3. Resolve obvious deterministic actions first ──────────────

  const deterministicAction = resolveDeterministicAction(
    playerInput,
    world,
    player,
  );

  let proposedActions: ProposedAction[] = [];

  if (deterministicAction) {
    proposedActions = [deterministicAction];
  } else {
    const prompt = buildTurnPrompt({
      playerInput,
      currentRoom: localContext.currentRoom,
      nearbyRooms: localContext.nearbyRooms,
      inventory: localContext.inventoryItems,
      roomItems: localContext.roomItems,
      roomNPCs: localContext.roomNPCs,
      roomInteractables: localContext.roomInteractables,
      activePuzzles: localContext.activePuzzles,
      recentHistory: localContext.recentHistory,
      responseLength: settings.responseLength,
      playerFlags: localContext.playerFlags,
    });

    // ── 4. Call AI when deterministic resolution did not apply ────

    let rawResponse: string;
    try {
      const completion = await ai.generateCompletion(
        prompt,
        {
          model: settings.gameplayModel,
          systemMessage: GAMEPLAY_SYSTEM_PROMPT,
        },
        aiConfig,
      );
      rawResponse = completion.content;
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : "AI provider error",
        player,
      );
    }

    // ── 5. Parse AI response ──────────────────────────────────────

    const aiResponse = parseAIResponse(rawResponse);

    if (!aiResponse) {
      // Return fallback — no state changes
      return {
        success: true,
        narrative: FALLBACK_NARRATIVE,
        actionResults: [],
        newPlayerState: player,
        worldChanged: false,
        gameWon: false,
      };
    }

    proposedActions = aiResponse.proposedActions;
  }

  // ── 6. Validate and apply actions ───────────────────────────────

  const actionResults: ActionResult[] = [];
  let currentWorld = world;
  let currentPlayer = player;
  for (const proposedAction of proposedActions) {
    const { result, world: newWorld, player: newPlayer } = applyAction(
      proposedAction,
      currentWorld,
      currentPlayer,
    );

    actionResults.push(result);

    if (result.success) {
      currentWorld = newWorld;
      currentPlayer = newPlayer;
    }
  }

  const worldChanged = hasWorldChanged(actionResults);
  const narrativeStream = createBufferedNarrativeStream(onNarrativeChunk);

  // ── 7. Check win condition ──────────────────────────────────────

  const gameWon = checkWinCondition(currentWorld, currentPlayer);
  const validatedNarrative = await generateValidatedNarrative(
    ai,
    aiConfig,
    settings,
    playerInput,
    actionResults,
    world,
    player,
    currentWorld,
    currentPlayer,
    history,
    gameWon,
    onNarrativeChunk ? narrativeStream.pushChunk : undefined,
  );

  // ── 8. Save state ───────────────────────────────────────────────

  try {
    // Optimistic locking on player state
    const updated = await store.updatePlayerState(
      gameId,
      currentPlayer,
      originalVersion,
    );

    if (!updated) {
      return errorResult(
        "State conflict: another request modified this game. Please retry.",
        player,
      );
    }

    // Save world if mutated
    if (worldChanged) {
      await store.saveWorld(gameId, currentWorld);
    }

    // Append history — player entry then narrator entry
    const now = Date.now();

    const playerEntry: TurnEntry = {
      turnId,
      role: "player",
      text: playerInput,
      timestamp: now,
    };

    const narratorEntry: TurnEntry = {
      turnId,
      role: "narrator",
      text: validatedNarrative,
      timestamp: now,
    };

    await store.appendHistory(gameId, playerEntry);
    await store.appendHistory(gameId, narratorEntry);

    // Update metadata
    const metadata = await store.getMetadata(gameId);
    if (metadata) {
      await store.saveMetadata(gameId, {
        ...metadata,
        lastPlayedAt: now,
        turnCount: metadata.turnCount + 1,
        completed: gameWon || metadata.completed,
      });
    }

    narrativeStream.flush();
  } catch (err) {
    return errorResult(
      err instanceof Error ? err.message : "Failed to save game state",
      currentPlayer,
    );
  }

  // ── 9. Return result ────────────────────────────────────────────

  return {
    success: true,
    narrative: validatedNarrative,
    actionResults,
    newPlayerState: currentPlayer,
    worldChanged,
    gameWon,
  };
}
