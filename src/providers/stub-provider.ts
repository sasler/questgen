import type {
  AICompletionOptions,
  AICompletionResult,
  AIModelInfo,
  AIProviderConfig,
  IAIProvider,
} from "./types";

function extractSection(prompt: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = prompt.match(
    new RegExp(`## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`),
  );
  return match?.[1]?.trim() ?? "";
}

function collectSectionIds(prompt: string, label: string): string[] {
  const section = extractSection(prompt, "Structural scaffold");
  const match = section.match(
    new RegExp(`${label}:\\n([\\s\\S]*?)(?=\\n[A-Z][^\\n]*:|$)`),
  );
  if (!match) {
    return [];
  }

  return match[1]
    .split("\n")
    .map((line) => line.match(/^- ([a-z0-9-]+)/i)?.[1] ?? null)
    .filter((value): value is string => value !== null);
}

function collectRoomIds(prompt: string): string[] {
  return collectSectionIds(prompt, "Rooms");
}

function collectItemIds(prompt: string): string[] {
  return collectSectionIds(prompt, "Items");
}

function collectNpcIds(prompt: string): string[] {
  return collectSectionIds(prompt, "NPCs");
}

function collectInteractableIds(prompt: string): string[] {
  return collectSectionIds(prompt, "Interactables");
}

function collectPuzzleIds(prompt: string): string[] {
  return collectSectionIds(prompt, "Puzzles");
}

function collectLockIds(prompt: string): string[] {
  return collectSectionIds(prompt, "Locks");
}

function buildGeneratedWorld(prompt: string): string {
  const description = extractSection(prompt, "Game Description") || "A grounded sci-fi expedition";
  const topic = description.split(/\s+/).slice(0, 3).join(" ");
  const roomIds = collectRoomIds(prompt);
  const itemIds = collectItemIds(prompt);
  const npcIds = collectNpcIds(prompt);
  const interactableIds = collectInteractableIds(prompt);
  const puzzleIds = collectPuzzleIds(prompt);
  const lockIds = collectLockIds(prompt);

  const rooms = Object.fromEntries(
    roomIds.map((roomId, index) => [
      roomId,
      {
        name: `Sector ${index + 1}`,
        description: `${topic} spills into ${roomId}, which looks as though maintenance lost a philosophical debate here.`,
        ...(index === 0
          ? {
              firstVisitText:
                "You arrive amid the sort of machinery that hums like it expects an apology.",
            }
          : {}),
      },
    ]),
  );

  const items = Object.fromEntries(
    itemIds.map((itemId, index) => [
      itemId,
      {
        name:
          itemId === "progression-item-1"
            ? "Phase Calibrator"
            : `Field Note ${index + 1}`,
        description: `A grounded sci-fi tool assigned to ${itemId}.`,
      },
    ]),
  );

  const npcs = Object.fromEntries(
    npcIds.map((npcId, index) => [
      npcId,
      {
        name: `Operator ${index + 1}`,
        description: `A tired systems operator assigned to ${npcId}.`,
        dialogue: {
          greeting: "Please try not to improve anything faster than the paperwork can object.",
        },
      },
    ]),
  );

  const interactables = Object.fromEntries(
    interactableIds.map((interactableId, index) => [
      interactableId,
      {
        name:
          interactableId === "puzzle-target-1"
            ? "Relay Lattice"
            : "Final Transit Gate",
        description: `A stubborn piece of equipment for ${interactableId}.`,
        aliases:
          interactableId === "puzzle-target-1"
            ? ["relay lattice", "relay", "lattice"]
            : ["gate", "transit gate", "door"],
      },
    ]),
  );

  const puzzles = Object.fromEntries(
    puzzleIds.map((puzzleId) => [
      puzzleId,
      {
        name: "Relay Calibration",
        description:
          "The relay needs a competent calibration before the route ahead stops being difficult on purpose.",
        solutionDescription:
          "Use the Phase Calibrator on the Relay Lattice to stabilize the route.",
      },
    ]),
  );

  const locks = Object.fromEntries(
    lockIds.map((lockId) => [
      lockId,
      {
        conditionDescription:
          "Stabilize the Relay Lattice before the Final Transit Gate admits defeat.",
      },
    ]),
  );

  return JSON.stringify({
    rooms,
    items,
    npcs,
    interactables,
    puzzles,
    locks,
    winCondition: {
      description: "Reach the last room once the Final Transit Gate opens.",
    },
  });
}

function extractPlayerInput(prompt: string): string {
  return extractSection(prompt, "Player Input").trim().toLowerCase();
}

function extractFirstRoomItemId(prompt: string): string | null {
  const section = extractSection(prompt, "Items in Room");
  const match = section.match(/\(([^)]+)\)/);
  return match?.[1] ?? null;
}

function buildGameplayResponse(prompt: string): string {
  const playerInput = extractPlayerInput(prompt);

  if (/^(go |move |walk |head |travel |run |step |climb )?(north|south|east|west|up|down|n|s|e|w|u|d)$/.test(playerInput)) {
    const direction = playerInput.split(" ").at(-1);
    return JSON.stringify({
      narrative: `You move ${direction}.`,
      proposedActions: [{ type: "move", direction }],
    });
  }

  if (/^(take|pick up|grab)\b/.test(playerInput)) {
    const itemId = extractFirstRoomItemId(prompt);
    return JSON.stringify({
      narrative: "You pick up the nearby object.",
      proposedActions: itemId ? [{ type: "pickup", itemId }] : [],
    });
  }

  return JSON.stringify({
    narrative: "You take a cautious look around.",
    proposedActions: [],
  });
}

function buildValidatedNarration(prompt: string): string {
  if (prompt.includes("Describe the player's opening situation")) {
    const currentRoom = prompt.match(/Current room: ([^\n]+)/)?.[1] ?? "the room";
    return `You begin in ${currentRoom}, where the machinery already sounds mildly disappointed with everyone involved.`;
  }

  const outcomeLines = [...prompt.matchAll(/\d+\.\s+(SUCCESS|FAILURE)\s+-\s+([^\n]+)/g)];
  if (outcomeLines.length > 0) {
    return outcomeLines.map((match) => match[2]).join(" ");
  }

  return "Reality remains consistent, which is more than can be said for the paperwork.";
}

function buildHint(prompt: string): string {
  const recommendation = extractSection(prompt, "Deterministic next-step recommendation");
  return recommendation || "Try the most obvious next step before the station invents another form.";
}

function buildAdminAnswer(): string {
  return "Confirmed engine facts: the move succeeded, the player state updated, and the validated result should be narrated as success. If the player saw a failure-shaped line, the bug is in how narration or command handling was wired, not in the room graph.";
}

export class StubProvider implements IAIProvider {
  async generateCompletion(
    prompt: string,
    options: AICompletionOptions,
    _config: AIProviderConfig,
  ): Promise<AICompletionResult> {
    if (options.systemMessage.includes("game content architect")) {
      return { content: buildGeneratedWorld(prompt), model: options.model };
    }

    if (options.systemMessage.includes("in-world hint system")) {
      return { content: buildHint(prompt), model: options.model };
    }

    if (options.systemMessage.includes("admin debugging assistant")) {
      return { content: buildAdminAnswer(), model: options.model };
    }

    if (options.systemMessage.includes("The \"narrative\" is what the player reads")) {
      return { content: buildGameplayResponse(prompt), model: options.model };
    }

    if (options.systemMessage.includes("final narrator for a deterministic text adventure engine")) {
      return { content: buildValidatedNarration(prompt), model: options.model };
    }

    return {
      content: "The stub provider received a prompt it did not expect.",
      model: options.model,
    };
  }

  async streamCompletion(
    prompt: string,
    options: AICompletionOptions,
    config: AIProviderConfig,
    onChunk: (chunk: string) => void,
  ): Promise<AICompletionResult> {
    const completion = await this.generateCompletion(prompt, options, config);
    onChunk(completion.content);
    return completion;
  }

  async listModels(_config: AIProviderConfig): Promise<AIModelInfo[]> {
    return [
      {
        id: "questgen-stub-generation",
        name: "QuestGen Stub Generation",
        provider: "stub",
        recommended: "generation",
      },
      {
        id: "questgen-stub-gameplay",
        name: "QuestGen Stub Gameplay",
        provider: "stub",
        recommended: "gameplay",
      },
    ];
  }
}
