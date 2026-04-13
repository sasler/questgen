import { buildLocalContext } from "@/engine";
import { getAIProvider } from "@/providers";
import type { AIProviderConfig, IAIProvider } from "@/providers/types";
import { GameStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";
import type { GameSettings } from "@/types";

const ADMIN_DEBUG_SYSTEM_PROMPT = `You are the QuestGen admin debugging assistant.

You are NOT speaking as the game narrator and NOT roleplaying for the player. Speak plainly as an operator/debugger.

Use the full authoritative game state provided in the prompt. Distinguish clearly between:
- deterministic engine facts
- current persisted game state
- normal player-turn local context
- uncertainty or missing evidence

If the admin asks why something happened, explain what the state shows and what the most likely cause is. Return plain text only.`;

function buildAdminDebugPrompt(
  question: string,
  fullState: {
    metadata: unknown;
    settings: unknown;
    world: unknown;
    player: unknown;
    history: unknown;
    localContext: unknown;
  },
): string {
  return [
    "## Admin question",
    question,
    "",
    "## Model selection",
    `Use the configured generation/debug model: ${JSON.stringify((fullState.settings as { generationModel?: string })?.generationModel ?? "unknown")}`,
    "",
    "## Full game state",
    JSON.stringify(
      {
        metadata: fullState.metadata,
        settings: fullState.settings,
        world: fullState.world,
        player: fullState.player,
        history: fullState.history,
      },
      null,
      2,
    ),
    "",
    "## Standard player-turn local context",
    JSON.stringify(fullState.localContext, null, 2),
    "",
    "Explain the issue clearly, cite the relevant state, and separate confirmed facts from inference.",
  ].join("\n");
}

export async function generateAdminDebugResponse(
  gameId: string,
  question: string,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  storage?: IGameStorage,
  provider?: IAIProvider,
): Promise<string> {
  const store = storage ?? new GameStorage();
  const ai = provider ?? getAIProvider();
  const [world, player, history, metadata] = await Promise.all([
    store.getWorld(gameId),
    store.getPlayerState(gameId),
    store.getHistory(gameId),
    store.getMetadata(gameId),
  ]);

  if (!world) {
    throw new Error("Game world not found");
  }

  if (!player) {
    throw new Error("Player state not found");
  }

  if (!metadata) {
    throw new Error("Game metadata not found");
  }

  const localContext = buildLocalContext(world, player, history);
  const completion = await ai.generateCompletion(
    buildAdminDebugPrompt(question, {
      metadata,
      settings,
      world,
      player,
      history,
      localContext,
    }),
    {
      model: settings.generationModel,
      systemMessage: ADMIN_DEBUG_SYSTEM_PROMPT,
    },
    aiConfig,
  );

  const response = completion.content.trim();
  if (response.length === 0) {
    throw new Error("Admin debug response was empty");
  }

  return response;
}
