import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSettings, GameWorld, PlayerState, TurnEntry, GameMetadata } from "@/types";
import type { AIProviderConfig, IAIProvider } from "@/providers/types";
import type { IGameStorage } from "@/lib/storage";

function makeWorld(): GameWorld {
  return {
    rooms: {
      engine: {
        id: "engine",
        name: "Engine Room",
        description: "Anxious machinery fills the chamber.",
        itemIds: ["power-cell"],
        npcIds: ["npc-1"],
      },
      bridge: {
        id: "bridge",
        name: "Bridge",
        description: "A command deck with trust issues.",
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
        properties: {},
      },
    },
    npcs: {
      "npc-1": {
        id: "npc-1",
        name: "Quartermaster",
        description: "A quartermaster who trusts forms more than people.",
        dialogue: { greeting: "Please submit your emergency in triplicate." },
        state: "waiting",
      },
    },
    interactables: {
      "relay-console": {
        id: "relay-console",
        roomId: "engine",
        name: "Relay Console",
        description: "A console blinking with administrative disdain.",
        aliases: ["console", "relay console"],
        state: "offline",
        properties: {},
      },
    },
    connections: [
      {
        fromRoomId: "engine",
        toRoomId: "bridge",
        direction: "north",
        reverseDirection: "south",
      },
    ],
    puzzles: {},
    locks: {},
    winCondition: {
      type: "reach_room",
      targetId: "bridge",
      description: "Reach the bridge.",
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

function makeMetadata(): GameMetadata {
  return {
    id: "game-1",
    userId: "user-1",
    title: "Test Adventure",
    description: "A test game",
    size: "small",
    createdAt: 1000,
    lastPlayedAt: 1000,
    turnCount: 2,
    completed: false,
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

describe("generateAdminDebugResponse", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("grounds the admin prompt in full game state instead of player-local context only", async () => {
    const { generateAdminDebugResponse } = await import("./admin-debug");
    const storage = {
      getWorld: vi.fn().mockResolvedValue(makeWorld()),
      getPlayerState: vi.fn().mockResolvedValue(makePlayer()),
      getHistory: vi.fn().mockResolvedValue([
        {
          turnId: "turn-1",
          role: "player",
          text: "go north",
          timestamp: 1,
        } satisfies TurnEntry,
      ]),
      getMetadata: vi.fn().mockResolvedValue(makeMetadata()),
      getSettings: vi.fn().mockResolvedValue(settings),
      updatePlayerState: vi.fn(),
      saveSettings: vi.fn(),
      saveWorld: vi.fn(),
      savePlayerState: vi.fn(),
      appendHistory: vi.fn(),
      saveMetadata: vi.fn(),
      addGameToUser: vi.fn(),
      removeGameFromUser: vi.fn(),
      getUserGames: vi.fn(),
      deleteGame: vi.fn(),
      gameExists: vi.fn(),
    } satisfies IGameStorage;

    const provider: IAIProvider = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: "The engine state says the move succeeded; the narrator got confused later.",
        model: "gpt-4o",
      }),
      streamCompletion: vi.fn(),
      listModels: vi.fn(),
    };

    const answer = await generateAdminDebugResponse(
      "game-1",
      "Why did the narrator say movement failed?",
      aiConfig,
      settings,
      storage,
      provider,
    );

    expect(answer).toContain("move succeeded");
    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);

    const prompt = vi.mocked(provider.generateCompletion).mock.calls[0][0];
    expect(prompt).toContain("## Admin question");
    expect(prompt).toContain("Why did the narrator say movement failed?");
    expect(prompt).toContain("## Full game state");
    expect(prompt).toContain("\"currentRoomId\": \"engine\"");
    expect(prompt).toContain("\"rooms\"");
    expect(prompt).toContain("## Standard player-turn local context");
    expect(prompt).toContain("Engine Room");
    expect(prompt).toContain("Bridge");
  });

  it("uses getStorage when no storage override is provided", async () => {
    const storage = {
      getWorld: vi.fn().mockResolvedValue(makeWorld()),
      getPlayerState: vi.fn().mockResolvedValue(makePlayer()),
      getHistory: vi.fn().mockResolvedValue([]),
      getMetadata: vi.fn().mockResolvedValue(makeMetadata()),
      getSettings: vi.fn().mockResolvedValue(settings),
      updatePlayerState: vi.fn(),
      saveSettings: vi.fn(),
      saveWorld: vi.fn(),
      savePlayerState: vi.fn(),
      appendHistory: vi.fn(),
      saveMetadata: vi.fn(),
      addGameToUser: vi.fn(),
      removeGameFromUser: vi.fn(),
      getUserGames: vi.fn(),
      deleteGame: vi.fn(),
      gameExists: vi.fn(),
    } satisfies IGameStorage;

    vi.doMock("@/lib/storage", async () => {
      const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
      return {
        ...actual,
        getStorage: vi.fn(() => storage),
      };
    });

    const provider: IAIProvider = {
      generateCompletion: vi.fn().mockResolvedValue({
        content: "All state came from the mocked storage.",
        model: "gpt-4o",
      }),
      streamCompletion: vi.fn(),
      listModels: vi.fn(),
    };

    const { generateAdminDebugResponse } = await import("./admin-debug");
    const answer = await generateAdminDebugResponse(
      "game-1",
      "What storage did you use?",
      aiConfig,
      settings,
      undefined,
      provider,
    );

    expect(answer).toContain("mocked storage");
    expect(storage.getWorld).toHaveBeenCalledWith("game-1");
    expect(provider.generateCompletion).toHaveBeenCalledTimes(1);
  });
});
