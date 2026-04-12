import type {
  GameGenerationRequest,
  GameMetadata,
  GameSettings,
  PlayerState,
} from "@/types";
import { validateWorld } from "@/engine";
import { formatStorageError, getStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";
import { buildDeterministicWorld } from "@/lib/deterministic-world";
import type { IAIProvider, AIProviderConfig } from "@/providers/types";

export interface WorldGenResult {
  success: boolean;
  gameId?: string;
  error?: string;
  warnings?: string[];
}

function deriveTitle(description: string): string {
  return description.length > 60 ? `${description.slice(0, 57)}...` : description;
}

export async function generateWorld(
  request: GameGenerationRequest,
  settings: GameSettings,
  userId: string,
  _aiConfig: AIProviderConfig,
  storage?: IGameStorage,
  _provider?: IAIProvider,
): Promise<WorldGenResult> {
  let resolvedStorage: IGameStorage;

  try {
    resolvedStorage = storage ?? getStorage();
  } catch (err) {
    return {
      success: false,
      error: formatStorageError(err),
    };
  }

  const gameId = crypto.randomUUID();
  const generationSeed = crypto.randomUUID();
  const world = buildDeterministicWorld(request, generationSeed);
  const validation = validateWorld(world);

  if (!validation.valid) {
    return {
      success: false,
      error: `World validation errors: ${validation.errors.map((error) => error.message).join("; ")}`,
    };
  }

  const warnings = validation.warnings.map((warning) => warning.message);

  try {
    const initialPlayer: PlayerState = {
      currentRoomId: world.startRoomId,
      inventory: [],
      visitedRooms: [world.startRoomId],
      flags: {},
      turnCount: 0,
      stateVersion: 0,
    };

    const now = Date.now();
    const metadata: GameMetadata = {
      id: gameId,
      userId,
      title: deriveTitle(request.description),
      description: request.description,
      size: request.size,
      createdAt: now,
      lastPlayedAt: now,
      turnCount: 0,
      completed: false,
      generationSeed,
    };

    await resolvedStorage.saveWorld(gameId, world);
    await resolvedStorage.savePlayerState(gameId, initialPlayer);
    await resolvedStorage.saveMetadata(gameId, metadata);
    await resolvedStorage.saveSettings(gameId, settings);
    await resolvedStorage.addGameToUser(userId, gameId);
  } catch (err) {
    return {
      success: false,
      error: formatStorageError(err),
    };
  }

  return {
    success: true,
    gameId,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
