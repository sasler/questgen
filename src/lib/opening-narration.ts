import { buildLocalContext } from "@/engine";
import { buildNarrativePrompt, VALIDATED_NARRATION_SYSTEM_PROMPT } from "@/prompts";
import { getAIProvider } from "@/providers";
import type { AIProviderConfig, IAIProvider } from "@/providers/types";
import { GameStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";
import type { GameSettings, GameWorld, PlayerState, TurnEntry } from "@/types";

function buildOpeningContext(
  world: GameWorld,
  player: PlayerState,
  history: TurnEntry[],
): string {
  const localContext = buildLocalContext(world, player, history);
  const lines = [
    `Current room: ${localContext.currentRoom.name}`,
    `Room description: ${localContext.currentRoom.description}`,
  ];

  if (localContext.currentRoom.firstVisitText) {
    lines.push(`First-visit text: ${localContext.currentRoom.firstVisitText}`);
  }

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

  return lines.join("\n");
}

function buildOpeningFallback(world: GameWorld, player: PlayerState): string {
  const room = world.rooms[player.currentRoomId];
  if (!room) {
    return "You find yourself somewhere the map has neglected to admit exists.";
  }

  return [room.firstVisitText, room.description].filter(Boolean).join(" ");
}

export async function generateOpeningNarration(
  gameId: string,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  storage?: IGameStorage,
  provider?: IAIProvider,
  onNarrativeChunk?: (chunk: string) => void,
): Promise<TurnEntry | null> {
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
  if (history.length > 0) {
    return null;
  }

  const fallbackNarrative = buildOpeningFallback(world, player);
  let narrative = fallbackNarrative;

  try {
    const prompt = buildNarrativePrompt(
      buildOpeningContext(world, player, history),
      [
        "Describe the player's opening situation before any command has been entered.",
        "No action has been taken yet.",
        "Introduce the room, visible exits, notable items, and any NPCs present.",
      ].join("\n"),
    );

    const completion = onNarrativeChunk
      ? await ai.streamCompletion(
          prompt,
          {
            model: settings.gameplayModel,
            systemMessage: VALIDATED_NARRATION_SYSTEM_PROMPT,
          },
          aiConfig,
          onNarrativeChunk,
        )
      : await ai.generateCompletion(
          prompt,
          {
            model: settings.gameplayModel,
            systemMessage: VALIDATED_NARRATION_SYSTEM_PROMPT,
          },
          aiConfig,
        );

    const generatedNarrative = completion.content.trim();
    if (generatedNarrative.length > 0) {
      narrative = generatedNarrative;
    }
  } catch {}

  const entry: TurnEntry = {
    turnId: `intro:${gameId}`,
    role: "narrator",
    text: narrative,
    timestamp: Date.now(),
  };

  await store.appendHistory(gameId, entry);
  return entry;
}
