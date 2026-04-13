import type {
  GameGenerationRequest,
  GameMetadata,
  GameSettings,
  GameWorld,
  PlayerState,
} from "@/types";
import { validateWorld } from "@/engine";
import { formatStorageError, getStorage } from "@/lib/storage";
import type { IGameStorage } from "@/lib/storage";
import { buildDeterministicWorld } from "@/lib/deterministic-world";
import { getAIProvider } from "@/providers";
import {
  buildWorldGenerationPrompt,
  buildWorldRepairPrompt,
  WORLD_GENERATION_SYSTEM_PROMPT,
} from "@/prompts";
import type { IAIProvider, AIProviderConfig } from "@/providers/types";
import { z } from "zod";

export interface WorldGenResult {
  success: boolean;
  gameId?: string;
  error?: string;
  warnings?: string[];
}

function formatWorldGenerationError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `World generation failed: ${message}`;
}

function deriveTitle(description: string): string {
  return description.length > 60 ? `${description.slice(0, 57)}...` : description;
}

const GeneratedRoomContentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  firstVisitText: z.string().min(1).optional(),
});

const GeneratedItemContentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

const GeneratedNpcContentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  dialogue: z.object({
    greeting: z.string().min(1),
  }),
});

const GeneratedInteractableContentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
});

const GeneratedPuzzleContentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  solutionDescription: z.string().min(1),
});

const GeneratedLockContentSchema = z.object({
  conditionDescription: z.string().min(1),
});

const GeneratedWorldContentSchema = z.object({
  rooms: z.record(z.string(), GeneratedRoomContentSchema),
  items: z.record(z.string(), GeneratedItemContentSchema),
  npcs: z.record(z.string(), GeneratedNpcContentSchema),
  interactables: z.record(z.string(), GeneratedInteractableContentSchema),
  puzzles: z.record(z.string(), GeneratedPuzzleContentSchema),
  locks: z.record(z.string(), GeneratedLockContentSchema),
  winCondition: z.object({
    description: z.string().min(1),
  }),
});

type GeneratedWorldContent = z.infer<typeof GeneratedWorldContentSchema>;
const MAX_GENERATION_ATTEMPTS = 3;

function extractJSON(raw: string): string | null {
  const stripped = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  return stripped.substring(first, last + 1);
}

function parseGeneratedWorldContent(raw: string): GeneratedWorldContent | null {
  const json = extractJSON(raw);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json);
    const validated = GeneratedWorldContentSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function summarizeConnections(world: GameWorld): string[] {
  return world.connections.map((connection) => {
    const fromRoom = world.rooms[connection.fromRoomId];
    const toRoom = world.rooms[connection.toRoomId];
    const lockSuffix = connection.lockId ? ` [lock: ${connection.lockId}]` : "";
    return `- ${connection.fromRoomId} (${fromRoom?.name ?? connection.fromRoomId}) ${connection.direction} -> ${connection.toRoomId} (${toRoom?.name ?? connection.toRoomId})${lockSuffix}`;
  });
}

function buildScaffoldSummary(world: GameWorld): string {
  const lines = [
    "All IDs below are fixed and must be reused exactly as written.",
    "",
    "Rooms:",
    ...Object.values(world.rooms).map(
      (room) => {
        const startRoomNote = room.id === world.startRoomId
          ? "; start room requires firstVisitText"
          : "";
        return `- ${room.id}: placeholder room slot; items [${room.itemIds.join(", ") || "none"}]; npcs [${room.npcIds.join(", ") || "none"}]${startRoomNote}`;
      },
    ),
    "",
    "Connections:",
    ...summarizeConnections(world),
    "",
    "Items:",
    ...Object.values(world.items).map(
      (item) =>
        `- ${item.id}: portable=${item.portable}; role=${String(item.properties.role ?? "unspecified")}; usableWith=[${item.usableWith?.join(", ") || "none"}]`,
    ),
    "",
    "NPCs:",
    ...Object.values(world.npcs).map((npc) => `- ${npc.id}: guide/support slot`),
    "",
    "Interactables:",
    ...Object.values(world.interactables).map(
      (interactable) =>
        `- ${interactable.id}: room=${interactable.roomId}; role=${String(interactable.properties.role ?? "unspecified")}; state=${interactable.state}`,
    ),
    "",
    "Puzzles:",
    ...Object.values(world.puzzles).map((puzzle) => {
      const itemIds = puzzle.solution.itemIds?.join(", ") || "none";
      const target = puzzle.solution.targetInteractableId ?? "none";
      return `- ${puzzle.id}: room=${puzzle.roomId}; requires items [${itemIds}]; target interactable=${target}; reward=${puzzle.reward.type}:${puzzle.reward.targetId}`;
    }),
    "",
    "Locks:",
    ...Object.values(world.locks).map((lock) => {
      const target = lock.targetInteractableId ?? "none";
      return `- ${lock.id}: mechanism=${lock.mechanism}; puzzle=${lock.puzzleId ?? "none"}; key=${lock.keyItemId ?? "none"}; target interactable=${target}`;
    }),
    "",
    `Win condition: ${world.winCondition.type} -> ${world.winCondition.targetId}`,
  ];

  return lines.join("\n");
}

function ensureExactRecordKeys(
  label: string,
  actual: Record<string, unknown>,
  expectedKeys: string[],
  errors: string[],
): void {
  const actualKeys = new Set(Object.keys(actual));

  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) {
      errors.push(`Missing ${label} content for "${key}".`);
    }
  }

  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) {
      errors.push(`Unexpected ${label} content for "${key}".`);
    }
  }
}

function validateGeneratedContentAgainstWorld(
  content: GeneratedWorldContent,
  world: GameWorld,
): string[] {
  const errors: string[] = [];

  ensureExactRecordKeys("room", content.rooms, Object.keys(world.rooms), errors);
  ensureExactRecordKeys("item", content.items, Object.keys(world.items), errors);
  ensureExactRecordKeys("NPC", content.npcs, Object.keys(world.npcs), errors);
  ensureExactRecordKeys(
    "interactable",
    content.interactables,
    Object.keys(world.interactables),
    errors,
  );
  ensureExactRecordKeys("puzzle", content.puzzles, Object.keys(world.puzzles), errors);
  ensureExactRecordKeys("lock", content.locks, Object.keys(world.locks), errors);

  if (!content.rooms[world.startRoomId]?.firstVisitText?.trim()) {
    errors.push(`Missing room content for "${world.startRoomId}": firstVisitText is required.`);
  }

  return errors;
}

function applyGeneratedWorldContent(
  world: GameWorld,
  content: GeneratedWorldContent,
): GameWorld {
  const enrichedWorld: GameWorld = structuredClone(world);

  for (const [roomId, generatedRoom] of Object.entries(content.rooms)) {
    enrichedWorld.rooms[roomId] = {
      ...enrichedWorld.rooms[roomId],
      name: generatedRoom.name,
      description: generatedRoom.description,
      ...(generatedRoom.firstVisitText
        ? { firstVisitText: generatedRoom.firstVisitText }
        : {}),
    };
  }

  for (const [itemId, generatedItem] of Object.entries(content.items)) {
    enrichedWorld.items[itemId] = {
      ...enrichedWorld.items[itemId],
      name: generatedItem.name,
      description: generatedItem.description,
    };
  }

  for (const [npcId, generatedNpc] of Object.entries(content.npcs)) {
    enrichedWorld.npcs[npcId] = {
      ...enrichedWorld.npcs[npcId],
      name: generatedNpc.name,
      description: generatedNpc.description,
      dialogue: {
        ...enrichedWorld.npcs[npcId].dialogue,
        ...generatedNpc.dialogue,
      },
    };
  }

  for (const [interactableId, generatedInteractable] of Object.entries(
    content.interactables,
  )) {
    enrichedWorld.interactables[interactableId] = {
      ...enrichedWorld.interactables[interactableId],
      name: generatedInteractable.name,
      description: generatedInteractable.description,
      aliases: generatedInteractable.aliases,
    };
  }

  for (const [puzzleId, generatedPuzzle] of Object.entries(content.puzzles)) {
    enrichedWorld.puzzles[puzzleId] = {
      ...enrichedWorld.puzzles[puzzleId],
      name: generatedPuzzle.name,
      description: generatedPuzzle.description,
      solution: {
        ...enrichedWorld.puzzles[puzzleId].solution,
        description: generatedPuzzle.solutionDescription,
      },
    };
  }

  for (const [lockId, generatedLock] of Object.entries(content.locks)) {
    enrichedWorld.locks[lockId] = {
      ...enrichedWorld.locks[lockId],
      conditionDescription: generatedLock.conditionDescription,
    };
  }

  enrichedWorld.winCondition = {
    ...enrichedWorld.winCondition,
    description: content.winCondition.description,
  };

  return enrichedWorld;
}

function summarizeValidationIssues(validationErrors: string[]): string {
  return validationErrors.join("; ");
}

async function requestGeneratedWorldContent(
  ai: IAIProvider,
  aiConfig: AIProviderConfig,
  settings: GameSettings,
  prompt: string,
): Promise<GeneratedWorldContent | null> {
  const completion = await ai.generateCompletion(
    prompt,
    {
      model: settings.generationModel,
      systemMessage: WORLD_GENERATION_SYSTEM_PROMPT,
    },
    aiConfig,
  );

  return parseGeneratedWorldContent(completion.content);
}

async function authorWorldContent(
  ai: IAIProvider,
  aiConfig: AIProviderConfig,
  request: GameGenerationRequest,
  settings: GameSettings,
  scaffoldWorld: GameWorld,
): Promise<GeneratedWorldContent> {
  const scaffoldSummary = buildScaffoldSummary(scaffoldWorld);
  let issues: string[] = [];
  let previousAttempt = "";

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const initialPrompt =
      attempt === 0
        ? buildWorldGenerationPrompt(request, settings, scaffoldSummary)
        : buildWorldRepairPrompt(
            request,
            settings,
            scaffoldSummary,
            previousAttempt,
            issues,
            "repair",
          );
    const initialContent = await requestGeneratedWorldContent(
      ai,
      aiConfig,
      settings,
      initialPrompt,
    );

    if (!initialContent) {
      issues = [
        "The authored world did not parse as valid JSON matching the required schema.",
      ];
      previousAttempt = previousAttempt || "{}";
      continue;
    }

    previousAttempt = JSON.stringify(initialContent, null, 2);
    const contentErrors = validateGeneratedContentAgainstWorld(
      initialContent,
      scaffoldWorld,
    );
    if (contentErrors.length > 0) {
      issues = contentErrors;
      continue;
    }

    const validInitialAttempt = previousAttempt;
    let reviewIssues: string[] = [];

    for (let reviewAttempt = 0; reviewAttempt < MAX_GENERATION_ATTEMPTS; reviewAttempt += 1) {
      const reviewPrompt = buildWorldRepairPrompt(
        request,
        settings,
        scaffoldSummary,
        reviewAttempt === 0 ? validInitialAttempt : validInitialAttempt,
        reviewIssues,
        "review",
      );
      const reviewedContent = await requestGeneratedWorldContent(
        ai,
        aiConfig,
        settings,
        reviewPrompt,
      );

      if (!reviewedContent) {
        reviewIssues = [
          "The review pass did not return valid JSON matching the required schema.",
        ];
        continue;
      }

      const reviewedContentErrors = validateGeneratedContentAgainstWorld(
        reviewedContent,
        scaffoldWorld,
      );
      if (reviewedContentErrors.length > 0) {
        reviewIssues = reviewedContentErrors;
        continue;
      }

      const candidateWorld = applyGeneratedWorldContent(
        scaffoldWorld,
        reviewedContent,
      );
      const validation = validateWorld(candidateWorld);
      if (!validation.valid) {
        reviewIssues = validation.errors.map((error) => error.message);
        continue;
      }

      return reviewedContent;
    }

    issues =
      reviewIssues.length > 0
        ? reviewIssues
        : ["The review pass could not confirm the authored world."];
    previousAttempt = validInitialAttempt;
  }

  throw new Error(
    `AI world content failed validation after ${MAX_GENERATION_ATTEMPTS} attempts: ${summarizeValidationIssues(issues)}`,
  );
}

export async function generateWorld(
  request: GameGenerationRequest,
  settings: GameSettings,
  userId: string,
  aiConfig: AIProviderConfig,
  storage?: IGameStorage,
  provider?: IAIProvider,
): Promise<WorldGenResult> {
  let resolvedStorage: IGameStorage;
  let ai: IAIProvider;

  try {
    resolvedStorage = storage ?? getStorage();
    ai = provider ?? getAIProvider();
  } catch (err) {
    return {
      success: false,
      error: formatStorageError(err),
    };
  }

  const gameId = crypto.randomUUID();
  const generationSeed = crypto.randomUUID();
  let world;
  let warnings: string[] = [];

  try {
    world = buildDeterministicWorld(request, generationSeed);
    const generatedContent = await authorWorldContent(
      ai,
      aiConfig,
      request,
      settings,
      world,
    );
    world = applyGeneratedWorldContent(world, generatedContent);
    const validation = validateWorld(world);

    if (!validation.valid) {
      return {
        success: false,
        error: `World validation errors: ${validation.errors.map((error) => error.message).join("; ")}`,
      };
    }

    warnings = validation.warnings.map((warning) => warning.message);
  } catch (err) {
    return {
      success: false,
      error: formatWorldGenerationError(err),
    };
  }

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
