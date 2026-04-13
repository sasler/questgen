import { describe, it, expect } from "vitest";
import {
  WORLD_GENERATION_SYSTEM_PROMPT,
  GAMEPLAY_SYSTEM_PROMPT,
} from "./system-prompts";
import {
  buildWorldGenerationPrompt,
  buildWorldRepairPrompt,
  buildTurnPrompt,
  buildNarrativePrompt,
} from "./prompt-builders";
import type { TurnPromptParams } from "./prompt-builders";
import type {
  Room,
  Item,
  NPC,
  Interactable,
  Puzzle,
  TurnEntry,
  GameGenerationRequest,
  GameSettings,
} from "@/types";

// ── Helpers ─────────────────────────────────────────────────────────

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "bridge",
    name: "The Bridge",
    description: "The main command center of the ship.",
    itemIds: ["towel"],
    npcIds: ["zaphod"],
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "towel",
    name: "Towel",
    description: "A mostly harmless towel.",
    portable: true,
    properties: {},
    ...overrides,
  };
}

function makeNPC(overrides: Partial<NPC> = {}): NPC {
  return {
    id: "zaphod",
    name: "Zaphod Beeblebrox",
    description: "A two-headed galactic president.",
    dialogue: { greeting: "Hey, hoopy frood!" },
    state: "idle",
    ...overrides,
  };
}

function makeInteractable(overrides: Partial<Interactable> = {}): Interactable {
  return {
    id: "relay-console",
    roomId: "bridge",
    name: "Relay Console",
    description: "A console that would like to be useful but is making a point of not being.",
    aliases: ["console", "relay console"],
    state: "offline",
    properties: {},
    ...overrides,
  };
}

function makePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "airlock-puzzle",
    name: "Airlock Override",
    roomId: "bridge",
    description: "The airlock control panel needs a bypass code.",
    state: "unsolved",
    solution: { action: "use", itemIds: ["bypass-chip"] },
    reward: { type: "unlock", targetId: "airlock-lock" },
    ...overrides,
  };
}

function makeTurnEntry(overrides: Partial<TurnEntry> = {}): TurnEntry {
  return {
    turnId: "t1",
    role: "player",
    text: "look around",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<GameGenerationRequest> = {}): GameGenerationRequest {
  return {
    description: "A space station comedy adventure",
    size: "medium",
    genre: "sci-fi comedy",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    generationModel: "gpt-4o",
    gameplayModel: "gpt-4o-mini",
    responseLength: "moderate",
    provider: "copilot",
    ...overrides,
  };
}

function makeTurnParams(overrides: Partial<TurnPromptParams> = {}): TurnPromptParams {
  return {
    playerInput: "open the airlock",
    currentRoom: makeRoom(),
    nearbyRooms: [
      { direction: "north", room: makeRoom({ id: "corridor", name: "Corridor" }), locked: false, hidden: false },
    ],
    inventory: [makeItem()],
    roomItems: [makeItem({ id: "panel", name: "Control Panel", portable: false })],
    roomNPCs: [makeNPC()],
    roomInteractables: [makeInteractable()],
    activePuzzles: [makePuzzle()],
    recentHistory: [
      makeTurnEntry({ role: "player", text: "go north" }),
      makeTurnEntry({ role: "narrator", text: "You walk into the bridge." }),
    ],
    responseLength: "moderate",
    playerFlags: { visited_engine_room: true },
    ...overrides,
  };
}

// ── WORLD_GENERATION_SYSTEM_PROMPT ──────────────────────────────────

describe("WORLD_GENERATION_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof WORLD_GENERATION_SYSTEM_PROMPT).toBe("string");
    expect(WORLD_GENERATION_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("mentions the expected JSON structure fields", () => {
    const p = WORLD_GENERATION_SYSTEM_PROMPT;
    expect(p).toContain("rooms");
    expect(p).toContain("items");
    expect(p).toContain("npcs");
    expect(p).toContain("interactables");
    expect(p).toContain("puzzles");
    expect(p).toContain("locks");
    expect(p).toContain("winCondition");
  });

  it("mentions the no-magic rule", () => {
    expect(WORLD_GENERATION_SYSTEM_PROMPT.toLowerCase()).toContain("no magic");
  });

  it("references Hitchhiker's Guide humor style", () => {
    const p = WORLD_GENERATION_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain("hitchhiker");
  });

  it("requires kebab-case IDs", () => {
    expect(WORLD_GENERATION_SYSTEM_PROMPT.toLowerCase()).toContain("kebab-case");
  });

  it("requires solvability / no dead ends", () => {
    const p = WORLD_GENERATION_SYSTEM_PROMPT.toLowerCase();
    expect(p.includes("solvable") || p.includes("no dead end")).toBe(true);
  });

  it("mentions JSON response format", () => {
    expect(WORLD_GENERATION_SYSTEM_PROMPT).toContain("JSON");
  });
});

// ── GAMEPLAY_SYSTEM_PROMPT ──────────────────────────────────────────

describe("GAMEPLAY_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof GAMEPLAY_SYSTEM_PROMPT).toBe("string");
    expect(GAMEPLAY_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("describes the narrator role", () => {
    const p = GAMEPLAY_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain("narrator");
  });

  it("references Hitchhiker's Guide humor", () => {
    const p = GAMEPLAY_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain("hitchhiker");
  });

  it("specifies the JSON response format with narrative and proposedActions", () => {
    const p = GAMEPLAY_SYSTEM_PROMPT;
    expect(p).toContain("narrative");
    expect(p).toContain("proposedActions");
    expect(p).toContain("JSON");
  });

  it("mentions the ProposedAction types", () => {
    const p = GAMEPLAY_SYSTEM_PROMPT;
    expect(p).toContain("move");
    expect(p).toContain("pickup");
    expect(p).toContain("use_item");
    expect(p).toContain("solve_puzzle");
    expect(p).toContain("talk_npc");
  });

  it("warns against inventing non-existent world elements", () => {
    const p = GAMEPLAY_SYSTEM_PROMPT.toLowerCase();
    expect(
      p.includes("do not invent") || p.includes("don't invent") || p.includes("must not invent") || p.includes("never invent")
    ).toBe(true);
  });
});

// ── buildWorldGenerationPrompt ──────────────────────────────────────

describe("buildWorldGenerationPrompt", () => {
  it("includes the user's game description", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest(), makeSettings());
    expect(prompt).toContain("A space station comedy adventure");
  });

  it("includes the genre", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ genre: "noir" }), makeSettings());
    expect(prompt).toContain("noir");
  });

  it("includes size-specific room counts for small", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ size: "small" }), makeSettings());
    expect(prompt).toContain("Room slots in scaffold: 6");
  });

  it("includes size-specific room counts for medium", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ size: "medium" }), makeSettings());
    expect(prompt).toContain("Room slots in scaffold: 9");
  });

  it("includes size-specific room counts for large", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ size: "large" }), makeSettings());
    expect(prompt).toContain("Room slots in scaffold: 14");
  });

  it("includes size-specific room counts for epic", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ size: "epic" }), makeSettings());
    expect(prompt).toContain("Room slots in scaffold: 20");
  });

  it("includes the size label", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ size: "large" }), makeSettings());
    expect(prompt).toContain("large");
  });

  it("does not include free-form item, npc, or puzzle count guidance once the scaffold fixes exact records", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest({ size: "epic" }), makeSettings());

    expect(prompt).not.toContain("Items:");
    expect(prompt).not.toContain("NPCs:");
    expect(prompt).not.toContain("Puzzles:");
    expect(prompt).toContain("Use exactly the room and entity IDs from the structural scaffold");
  });

  it("mentions JSON format", () => {
    const prompt = buildWorldGenerationPrompt(makeRequest(), makeSettings());
    expect(prompt).toContain("JSON");
  });

  it("includes deterministic scaffold details when provided", () => {
    const prompt = buildWorldGenerationPrompt(
      makeRequest(),
      makeSettings(),
      [
        "Room IDs: room-1, room-2",
        "Critical slots:",
        "- item progression-item-1 in room-2",
        "- puzzle progression-puzzle-1 in room-2",
      ].join("\n"),
    );

    expect(prompt).toContain("Structural scaffold");
    expect(prompt).toContain("progression-item-1");
    expect(prompt).toContain("progression-puzzle-1");
  });
});

describe("buildWorldRepairPrompt", () => {
  it("includes the scaffold once and ends with the terminal instruction", () => {
    const prompt = buildWorldRepairPrompt(
      makeRequest(),
      makeSettings(),
      ["Rooms:", "- room-1", "", "Items:", "- progression-item-1"].join("\n"),
      '{"rooms":{}}',
      ['Missing room content for "room-1".'],
      "repair",
    );

    expect(prompt.match(/## Structural scaffold/g)).toHaveLength(1);
    expect(prompt).not.toContain("## Deterministic scaffold");
    expect(prompt.trim().endsWith("Return ONLY the corrected full JSON object. Do not explain your changes.")).toBe(true);
  });
});

// ── buildTurnPrompt ─────────────────────────────────────────────────

describe("buildTurnPrompt", () => {
  it("includes the player input", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("open the airlock");
  });

  it("includes the current room name", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("The Bridge");
  });

  it("includes inventory items", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("Towel");
  });

  it("includes room items", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("Control Panel");
  });

  it("includes NPC names", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("Zaphod Beeblebrox");
  });

  it("includes room interactables and aliases", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("Relay Console");
    expect(prompt).toContain("relay console");
  });

  it("includes active puzzle names", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("Airlock Override");
  });

  it("includes recent history", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("go north");
    expect(prompt).toContain("You walk into the bridge.");
  });

  it("includes nearby room info", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("Corridor");
    expect(prompt).toContain("north");
  });

  it("respects brief response length", () => {
    const prompt = buildTurnPrompt(makeTurnParams({ responseLength: "brief" }));
    expect(prompt).toMatch(/1.?-?.?2 sentence/i);
  });

  it("respects moderate response length", () => {
    const prompt = buildTurnPrompt(makeTurnParams({ responseLength: "moderate" }));
    expect(prompt).toMatch(/3.?-?.?5 sentence/i);
  });

  it("respects detailed response length", () => {
    const prompt = buildTurnPrompt(makeTurnParams({ responseLength: "detailed" }));
    expect(prompt).toMatch(/1.?-?.?2 paragraph/i);
  });

  it("handles empty inventory gracefully", () => {
    const prompt = buildTurnPrompt(makeTurnParams({ inventory: [] }));
    expect(prompt).toContain("open the airlock");
    // Should still be valid without crashing
  });

  it("handles empty history gracefully", () => {
    const prompt = buildTurnPrompt(makeTurnParams({ recentHistory: [] }));
    expect(prompt).toContain("open the airlock");
  });

  it("includes player flags", () => {
    const prompt = buildTurnPrompt(makeTurnParams());
    expect(prompt).toContain("visited_engine_room");
  });
});

// ── buildNarrativePrompt ────────────────────────────────────────────

describe("buildNarrativePrompt", () => {
  it("includes the context", () => {
    const prompt = buildNarrativePrompt("first visit to engine room", "describe the room");
    expect(prompt).toContain("first visit to engine room");
  });

  it("includes the event", () => {
    const prompt = buildNarrativePrompt("first visit to engine room", "describe the room");
    expect(prompt).toContain("describe the room");
  });

  it("is a non-empty string", () => {
    const prompt = buildNarrativePrompt("ctx", "evt");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
