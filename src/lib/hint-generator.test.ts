import { describe, expect, it, vi } from "vitest";
import { generateHint } from "./hint-generator";
import type { GameSettings, GameWorld, PlayerState, TurnEntry } from "@/types";
import type { AIProviderConfig, IAIProvider } from "@/providers/types";
import type { IGameStorage } from "@/lib/storage";

function makeWorld(): GameWorld {
  return {
    rooms: {
      engine: {
        id: "engine",
        name: "Engine Room",
        description: "Anxious machinery fills the chamber.",
        itemIds: [],
        npcIds: [],
      },
      cargo: {
        id: "cargo",
        name: "Cargo Hold",
        description: "Boxes glare at you suspiciously.",
        itemIds: ["power-cell"],
        npcIds: [],
      },
      airlock: {
        id: "airlock",
        name: "Airlock",
        description: "A place where atmosphere goes to die.",
        itemIds: [],
        npcIds: [],
      },
    },
    items: {
      "power-cell": {
        id: "power-cell",
        name: "Power Cell",
        description: "A humming replacement cell.",
        portable: true,
        usableWith: ["relay-console"],
        properties: {},
      },
    },
    npcs: {},
    interactables: {
      "relay-console": {
        id: "relay-console",
        roomId: "engine",
        name: "Relay Console",
        description: "A control station with trust issues.",
        aliases: ["relay console", "console"],
        state: "offline",
        properties: {},
      },
      "airlock-door": {
        id: "airlock-door",
        roomId: "engine",
        name: "Airlock Door",
        description: "A very committed sealed door.",
        aliases: ["airlock", "door"],
        state: "sealed",
        properties: {},
      },
    },
    connections: [
      {
        fromRoomId: "engine",
        toRoomId: "cargo",
        direction: "west",
        reverseDirection: "east",
      },
      {
        fromRoomId: "engine",
        toRoomId: "airlock",
        direction: "north",
        reverseDirection: "south",
        lockId: "airlock-lock",
      },
    ],
    puzzles: {
      "power-grid-fix": {
        id: "power-grid-fix",
        name: "Power Grid Fix",
        roomId: "engine",
        description: "Get the relay stack back online.",
        state: "unsolved",
        solution: {
          action: "install",
          itemIds: ["power-cell"],
          targetInteractableId: "relay-console",
          targetState: "online",
        },
        reward: {
          type: "unlock",
          targetId: "airlock-lock",
        },
      },
    },
    locks: {
      "airlock-lock": {
        id: "airlock-lock",
        state: "locked",
        mechanism: "puzzle",
        puzzleId: "power-grid-fix",
        targetInteractableId: "airlock-door",
        unlockedState: "open",
      },
    },
    winCondition: {
      type: "reach_room",
      targetId: "airlock",
      description: "Reach the airlock.",
    },
    startRoomId: "engine",
  };
}

function makePlayer(): PlayerState {
  return {
    currentRoomId: "engine",
    inventory: [],
    visitedRooms: ["engine"],
    flags: {},
    turnCount: 2,
    stateVersion: 1,
  };
}

const settings: GameSettings = {
  generationModel: "gpt-4o",
  gameplayModel: "gpt-4o-mini",
  responseLength: "moderate",
  provider: "copilot",
};

const aiConfig: AIProviderConfig = {
  mode: "copilot",
  githubToken: "fake-token",
};

describe("generateHint", () => {
  it("grounds the hint prompt in authoritative room interactable metadata", async () => {
    const storage = {
      getWorld: vi.fn().mockResolvedValue(makeWorld()),
      getPlayerState: vi.fn().mockResolvedValue(makePlayer()),
      getHistory: vi.fn().mockResolvedValue([
        {
          turnId: "turn-1",
          role: "player",
          text: "look at the console",
          timestamp: 1,
        } satisfies TurnEntry,
      ]),
      updatePlayerState: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      saveWorld: vi.fn(),
      savePlayerState: vi.fn(),
      appendHistory: vi.fn(),
      saveMetadata: vi.fn(),
      getMetadata: vi.fn(),
      addGameToUser: vi.fn(),
      removeGameFromUser: vi.fn(),
      getUserGames: vi.fn(),
      deleteGame: vi.fn(),
      gameExists: vi.fn(),
    } satisfies IGameStorage;

    const provider: IAIProvider = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: "Try the relay console once you have the power cell.",
        model: "gpt-4o-mini",
      }),
      streamCompletion: vi.fn(),
      listModels: vi.fn(),
    };

    const hint = await generateHint("game-1", aiConfig, settings, storage, provider);

    expect(hint).toBe("Try the relay console once you have the power cell.");
    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);

    const prompt = vi.mocked(provider.generateCompletion).mock.calls[0][0];
    expect(prompt).toContain("Relay Console");
    expect(prompt).toContain("relay console, console");
    expect(prompt).toContain("offline");
    expect(prompt).toContain("Airlock Door");
    expect(prompt).toContain("Power Grid Fix");
    expect(prompt).toContain("Power Cell");
  });
});
