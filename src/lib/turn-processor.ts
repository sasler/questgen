import type {
  GameWorld,
  PlayerState,
  TurnEntry,
  GameSettings,
  AITurnResponse,
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

function hasWorldChanged(previousWorld: GameWorld, nextWorld: GameWorld): boolean {
  return JSON.stringify(previousWorld) !== JSON.stringify(nextWorld);
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

  lines.push("", "Narrate only what actually happened.");
  return lines.join("\n");
}

async function generateValidatedNarrative(
  ai: IAIProvider,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  playerInput: string,
  actionResults: ActionResult[],
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
      buildValidatedNarrationEvent(playerInput, actionResults, gameWon),
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
    return narrative.length > 0 ? narrative : deterministicNarrative;
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

  // ── 3. Build prompt ─────────────────────────────────────────────

  const prompt = buildTurnPrompt({
    playerInput,
    currentRoom: localContext.currentRoom,
    nearbyRooms: localContext.nearbyRooms,
    inventory: localContext.inventoryItems,
    roomItems: localContext.roomItems,
    roomNPCs: localContext.roomNPCs,
    activePuzzles: localContext.activePuzzles,
    recentHistory: localContext.recentHistory,
    responseLength: settings.responseLength,
    playerFlags: localContext.playerFlags,
  });

  // ── 4. Call AI ──────────────────────────────────────────────────

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

  // ── 5. Parse AI response ────────────────────────────────────────

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

  // ── 6. Validate and apply actions ───────────────────────────────

  const actionResults: ActionResult[] = [];
  let currentWorld = world;
  let currentPlayer = player;
  for (const proposedAction of aiResponse.proposedActions) {
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

  const worldChanged = hasWorldChanged(world, currentWorld);

  // ── 7. Check win condition ──────────────────────────────────────

  const gameWon = checkWinCondition(currentWorld, currentPlayer);
  const validatedNarrative = await generateValidatedNarrative(
    ai,
    aiConfig,
    settings,
    playerInput,
    actionResults,
    currentWorld,
    currentPlayer,
    history,
    gameWon,
    onNarrativeChunk,
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
