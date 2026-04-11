import { GameWorldSchema } from "@/types";
import type {
  GameWorld,
  GameGenerationRequest,
  GameSettings,
  GameMetadata,
  PlayerState,
} from "@/types";
import type {
  IAIProvider,
  AIProviderConfig,
} from "@/providers/types";
import { getAIProvider } from "@/providers";
import { validateWorld } from "@/engine";
import {
  buildWorldGenerationPrompt,
  WORLD_GENERATION_SYSTEM_PROMPT,
} from "@/prompts";
import { formatStorageError, getStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";

export interface WorldGenResult {
  success: boolean;
  gameId?: string;
  error?: string;
  warnings?: string[];
}

/**
 * Extract a JSON object from a string that may be wrapped in markdown code blocks
 * or contain surrounding prose.
 */
function extractJson(raw: string): string {
  // Strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find first { and last }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw;
}

/**
 * Derive a title from the world or fall back to truncated description.
 */
function deriveTitle(world: GameWorld, description: string): string {
  // Use the first room's name or the start room name as a base
  const startRoom = world.rooms[world.startRoomId];
  if (startRoom) {
    return startRoom.name;
  }
  return description.length > 60 ? description.slice(0, 57) + "..." : description;
}

export async function generateWorld(
  request: GameGenerationRequest,
  settings: GameSettings,
  userId: string,
  aiConfig: AIProviderConfig,
  storage?: IGameStorage,
  provider?: IAIProvider,
): Promise<WorldGenResult> {
  const resolvedProvider = provider ?? getAIProvider();
  let resolvedStorage: IGameStorage;
  try {
    resolvedStorage = storage ?? getStorage();
  } catch (err) {
    return {
      success: false,
      error: formatStorageError(err),
    };
  }

  // Step 1: Generate game ID
  const gameId = crypto.randomUUID();

  // Step 2: Build prompt
  const userPrompt = buildWorldGenerationPrompt(request, settings);

  // Step 3–6: Attempt generation (with one retry)
  let world: GameWorld;
  let warnings: string[] = [];
  let lastError: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    // Step 3: Call AI
    let rawContent: string;
    try {
      const retryContext =
        attempt > 0 && lastError
          ? `\n\nYour previous response had errors. Please fix them and return valid JSON only:\n${lastError}`
          : "";

      const result = await resolvedProvider.generateCompletion(
        userPrompt + retryContext,
        {
          model: settings.generationModel,
          systemMessage: WORLD_GENERATION_SYSTEM_PROMPT,
        },
        aiConfig,
      );
      rawContent = result.content;
    } catch (err) {
      return {
        success: false,
        error: `AI generation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Step 4: Parse JSON
    let parsed: unknown;
    try {
      const jsonStr = extractJson(rawContent);
      parsed = JSON.parse(jsonStr);
    } catch {
      lastError = "Failed to parse JSON from AI response. Return ONLY a valid JSON object with no markdown or commentary.";
      continue;
    }

    // Step 5: Validate with Zod
    const zodResult = GameWorldSchema.safeParse(parsed);
    if (!zodResult.success) {
      const issues = zodResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      lastError = `Schema validation failed: ${issues}`;
      continue;
    }

    const candidate = zodResult.data as GameWorld;

    // Step 6: Validate with world validator
    const validation = validateWorld(candidate);
    if (!validation.valid) {
      const errorMsgs = validation.errors.map((e) => e.message).join("; ");
      lastError = `World validation errors: ${errorMsgs}`;
      continue;
    }

    warnings = validation.warnings.map((w) => w.message);
    world = candidate;

    // Step 7: Save to storage
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
        title: deriveTitle(world, request.description),
        description: request.description,
        size: request.size,
        createdAt: now,
        lastPlayedAt: now,
        turnCount: 0,
        completed: false,
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

    // Step 8: Return success
    return {
      success: true,
      gameId,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Both attempts failed
  return {
    success: false,
    error: lastError ?? "World generation failed after retry",
  };
}
