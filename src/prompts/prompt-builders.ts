import type {
  Direction,
  Room,
  Item,
  NPC,
  Interactable,
  Puzzle,
  TurnEntry,
  GameGenerationRequest,
  GameSettings,
} from "@/types";

// ── TurnPromptParams ────────────────────────────────────────────────

export interface TurnPromptParams {
  playerInput: string;
  currentRoom: Room;
  nearbyRooms: Array<{ direction: Direction; room: Room; locked: boolean; hidden: boolean }>;
  inventory: Item[];
  roomItems: Item[];
  roomNPCs: NPC[];
  roomInteractables: Interactable[];
  activePuzzles: Puzzle[];
  recentHistory: TurnEntry[];
  responseLength: "brief" | "moderate" | "detailed";
  playerFlags: Record<string, boolean>;
}

// ── Size guidelines ─────────────────────────────────────────────────

const STRUCTURAL_ROOM_COUNTS: Record<
  GameGenerationRequest["size"],
  { rooms: number }
> = {
  small: { rooms: 6 },
  medium: { rooms: 9 },
  large: { rooms: 14 },
  epic: { rooms: 20 },
};

// ── Response length guidance ────────────────────────────────────────

const RESPONSE_LENGTH_GUIDANCE: Record<TurnPromptParams["responseLength"], string> = {
  brief: "Keep your narrative to 1-2 sentences. Punchy and concise.",
  moderate: "Write 3-5 sentences. Enough detail to set the scene without overindulging.",
  detailed: "Write 1-2 paragraphs. Rich descriptions, atmospheric detail, and witty asides.",
};

// ── buildWorldGenerationPrompt ──────────────────────────────────────

export function buildWorldGenerationPrompt(
  request: GameGenerationRequest,
  _settings: GameSettings,
  scaffoldSummary?: string,
): string {
  const guide = STRUCTURAL_ROOM_COUNTS[request.size];

  const lines = [
    `Generate a ${request.size} text adventure game world as JSON.`,
    "",
    `## Game Description`,
    request.description,
    "",
  ];

  if (request.genre) {
    lines.push(`## Genre`, request.genre, "");
  }

  lines.push(
    `## Structural constraints (${request.size})`,
    `- Room slots in scaffold: ${guide.rooms}`,
    "- Use exactly the room and entity IDs from the structural scaffold.",
    "- Do not invent extra rooms, items, NPCs, interactables, puzzles, or locks.",
  );

  if (scaffoldSummary && scaffoldSummary.trim().length > 0) {
    lines.push("", "## Structural scaffold", scaffoldSummary.trim());
  }

  return lines.join("\n");
}

export function buildWorldRepairPrompt(
  request: GameGenerationRequest,
  _settings: GameSettings,
  scaffoldSummary: string,
  previousAttempt: string,
  issues: string[],
  mode: "repair" | "review",
): string {
  const lines = [
    mode === "repair"
      ? "Repair the authored world JSON so it fits the structural scaffold exactly."
      : "Review the authored world JSON for solvability and consistency. If it is already correct, return it unchanged. If not, return a corrected full JSON object.",
    "",
    "## Game Description",
    request.description,
    "",
  ];

  if (request.genre) {
    lines.push("## Genre", request.genre, "");
  }

  lines.push(
    "## Structural scaffold",
    scaffoldSummary.trim(),
    "",
    "## Previous authored world JSON",
    previousAttempt.trim(),
  );

  if (issues.length > 0) {
    lines.push("", "## Issues to fix", ...issues.map((issue) => `- ${issue}`));
  }

  lines.push(
    "",
    "Return ONLY the corrected full JSON object. Do not explain your changes.",
  );

  return lines.join("\n");
}

// ── buildTurnPrompt ─────────────────────────────────────────────────

export function buildTurnPrompt(params: TurnPromptParams): string {
  const {
    playerInput,
    currentRoom,
    nearbyRooms,
    inventory,
    roomItems,
    roomNPCs,
    roomInteractables,
    activePuzzles,
    recentHistory,
    responseLength,
    playerFlags,
  } = params;

  const sections: string[] = [];

  // Current room
  sections.push(
    `## Current Room`,
    `Name: ${currentRoom.name}`,
    `Description: ${currentRoom.description}`,
  );

  // Exits
  if (nearbyRooms.length > 0) {
    const exits = nearbyRooms
      .filter((nr) => !nr.hidden)
      .map((nr) => {
        const lock = nr.locked ? " [locked]" : "";
        return `- ${nr.direction}: ${nr.room.name}${lock}`;
      });
    if (exits.length > 0) {
      sections.push("", `## Exits`, ...exits);
    }
  }

  // Room items
  if (roomItems.length > 0) {
    sections.push(
      "",
      `## Items in Room`,
      ...roomItems.map((i) => `- ${i.name} (${i.id}): ${i.description}${i.portable ? "" : " [fixed]"}`),
    );
  }

  // NPCs
  if (roomNPCs.length > 0) {
    sections.push(
      "",
      `## NPCs Present`,
      ...roomNPCs.map((n) => `- ${n.name} (${n.id}): ${n.description} [state: ${n.state}]`),
    );
  }

  if (roomInteractables.length > 0) {
    sections.push(
      "",
      `## Interactables in Room`,
      ...roomInteractables.map(
        (interactable) =>
          `- ${interactable.name} (${interactable.id}): ${interactable.description} [state: ${interactable.state}; aliases: ${interactable.aliases.join(", ")}]`,
      ),
    );
  }

  // Inventory
  if (inventory.length > 0) {
    sections.push(
      "",
      `## Player Inventory`,
      ...inventory.map((i) => `- ${i.name} (${i.id})`),
    );
  } else {
    sections.push("", `## Player Inventory`, "Empty");
  }

  // Active puzzles
  if (activePuzzles.length > 0) {
    sections.push(
      "",
      `## Active Puzzles`,
      ...activePuzzles.map((p) => `- ${p.name} (${p.id}): ${p.description}`),
    );
  }

  // Player flags
  const flagEntries = Object.entries(playerFlags);
  if (flagEntries.length > 0) {
    sections.push(
      "",
      `## Player Flags`,
      ...flagEntries.map(([k, v]) => `- ${k}: ${v}`),
    );
  }

  // Recent history
  if (recentHistory.length > 0) {
    sections.push(
      "",
      `## Recent History`,
      ...recentHistory.map((t) => `[${t.role}]: ${t.text}`),
    );
  }

  // Response length
  sections.push("", `## Response Length`, RESPONSE_LENGTH_GUIDANCE[responseLength]);

  // Player input (always last)
  sections.push("", `## Player Input`, playerInput);

  return sections.join("\n");
}

// ── buildNarrativePrompt ────────────────────────────────────────────

export function buildNarrativePrompt(context: string, event: string): string {
  return [
    `Generate atmospheric flavor text in the style of Hitchhiker's Guide to the Galaxy.`,
    "",
    `## Context`,
    context,
    "",
    `## Event`,
    event,
    "",
    `Write a short, witty description. Return plain text, not JSON.`,
  ].join("\n");
}
