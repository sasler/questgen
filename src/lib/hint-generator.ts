import { buildLocalContext } from "@/engine";
import { getAIProvider } from "@/providers";
import type { AIProviderConfig, IAIProvider } from "@/providers/types";
import { GameStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";
import type { GameSettings, TurnEntry } from "@/types";
import { buildHintFallback, buildRoomInteractableHintLines } from "@/lib/progression";

const HINT_SYSTEM_PROMPT = `You are the in-world hint system for a comedic sci-fi text adventure.

Give actionable help without solving the whole game at once. Keep the tone dry, witty, and slightly exasperated. Use the deterministic recommendation provided in the prompt as the factual basis. Return plain text only.`;

function buildHintPrompt(
  context: ReturnType<typeof buildLocalContext>,
  roomInteractableLines: string[],
  fallbackHint: string,
  history: TurnEntry[],
): string {
  const lines = [
    "## Deterministic next-step recommendation",
    fallbackHint,
    "",
    "## Current room",
    `${context.currentRoom.name}: ${context.currentRoom.description}`,
    "",
    "## Room objects",
    ...(roomInteractableLines.length > 0 ? roomInteractableLines : ["- None"]),
    "",
    "## Visible exits",
    ...(context.nearbyRooms.length > 0
      ? context.nearbyRooms.map(
          (nearby) =>
            `- ${nearby.direction} to ${nearby.room.name}${nearby.locked ? " [locked]" : ""}`,
        )
      : ["- None"]),
    "",
    "## Inventory",
    ...(context.inventoryItems.length > 0
      ? context.inventoryItems.map((item) => `- ${item.name}`)
      : ["- Empty"]),
  ];

  if (history.length > 0) {
    lines.push(
      "",
      "## Recent history",
      ...history.slice(-4).map((entry) => `- [${entry.role}] ${entry.text}`),
    );
  }

  lines.push(
    "",
    "Write one short actionable hint. Keep it helpful, funny, and narrowly focused on the next useful step.",
  );

  return lines.join("\n");
}

export async function generateHint(
  gameId: string,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  storage?: IGameStorage,
  provider?: IAIProvider,
): Promise<string> {
  const store = storage ?? new GameStorage();
  const ai = provider ?? getAIProvider();
  const [world, player, history] = await Promise.all([
    store.getWorld(gameId),
    store.getPlayerState(gameId),
    store.getHistory(gameId),
  ]);

  if (!world) {
    throw new Error("Game world not found");
  }

  if (!player) {
    throw new Error("Player state not found");
  }

  const fallbackHint = buildHintFallback(world, player);

  try {
    const localContext = buildLocalContext(world, player, history);
    const roomInteractableLines = buildRoomInteractableHintLines(world, player);
    const completion = await ai.generateCompletion(
      buildHintPrompt(localContext, roomInteractableLines, fallbackHint, history),
      {
        model: settings.gameplayModel,
        systemMessage: HINT_SYSTEM_PROMPT,
      },
      aiConfig,
    );

    const hint = completion.content.trim();
    return hint.length > 0 ? hint : fallbackHint;
  } catch {
    return fallbackHint;
  }
}
