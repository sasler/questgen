import { describe, expect, it, vi } from "vitest";

import type { GameSettings, GameWorld, PlayerState } from "@/types";
import type { IGameStorage } from "@/lib/storage";
import type { AICompletionOptions, AIProviderConfig, IAIProvider } from "@/providers/types";

import { generateOpeningNarration } from "./opening-narration";

function createWorld(): GameWorld {
  return {
    rooms: {
      room1: {
        id: "room1",
        name: "Starting Room",
        description: "A dim room with a single locked door.",
        firstVisitText: "You wake with the sense that this room has been waiting for you.",
        itemIds: ["key1"],
        npcIds: ["guard1"],
      },
      room2: {
        id: "room2",
        name: "Hallway",
        description: "A plain hallway.",
        itemIds: [],
        npcIds: [],
      },
    },
    items: {
      key1: {
        id: "key1",
        name: "Iron Key",
        description: "A rusty key.",
        portable: true,
        usableWith: ["lock1"],
        properties: {},
      },
    },
    npcs: {
      guard1: {
        id: "guard1",
        name: "Guard",
        description: "A stern guard watches you.",
        dialogue: { default: "Halt." },
        state: "idle",
      },
    },
    connections: [
      {
        fromRoomId: "room1",
        toRoomId: "room2",
        direction: "north",
        reverseDirection: "south",
        lockId: "lock1",
      },
    ],
    puzzles: {},
    locks: {
      lock1: {
        id: "lock1",
        state: "locked",
        mechanism: "key",
        keyItemId: "key1",
      },
    },
    winCondition: {
      type: "reach_room",
      targetId: "room2",
      description: "Reach the hallway.",
    },
    startRoomId: "room1",
  };
}

function createPlayer(): PlayerState {
  return {
    currentRoomId: "room1",
    inventory: [],
    visitedRooms: ["room1"],
    flags: {},
    turnCount: 0,
    stateVersion: 1,
  };
}

function createSettings(): GameSettings {
  return {
    generationModel: "gpt-4o",
    gameplayModel: "gpt-4o-mini",
    responseLength: "moderate",
    provider: "copilot",
  };
}

function createStorage(): IGameStorage {
  return {
    getWorld: vi.fn().mockResolvedValue(createWorld()),
    getPlayerState: vi.fn().mockResolvedValue(createPlayer()),
    getHistory: vi.fn().mockResolvedValue([]),
    getMetadata: vi.fn().mockResolvedValue(null),
    getSettings: vi.fn().mockResolvedValue(createSettings()),
    updatePlayerState: vi.fn().mockResolvedValue(true),
    appendHistory: vi.fn().mockResolvedValue(undefined),
    saveMetadata: vi.fn().mockResolvedValue(undefined),
    saveWorld: vi.fn().mockResolvedValue(undefined),
    savePlayerState: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    addGameToUser: vi.fn().mockResolvedValue(undefined),
    removeGameFromUser: vi.fn().mockResolvedValue(undefined),
    getUserGames: vi.fn().mockResolvedValue([]),
    deleteGame: vi.fn().mockResolvedValue(undefined),
    gameExists: vi.fn().mockResolvedValue(true),
  };
}

function createProvider(): IAIProvider {
  return {
    generateCompletion: vi.fn(),
    streamCompletion: vi.fn(
      async (
        _prompt: string,
        _options: AICompletionOptions,
        _config: AIProviderConfig,
        onChunk: (chunk: string) => void,
      ) => {
        onChunk("You wake up ");
        onChunk("somewhere unpleasant.");

        return {
          content: "You wake up somewhere unpleasant.",
          model: "gpt-4o-mini",
          finishReason: "stop",
        };
      },
    ),
    listModels: vi.fn().mockResolvedValue([]),
  };
}

const defaultAIConfig: AIProviderConfig = {
  mode: "copilot",
  githubToken: "test-token",
};

describe("generateOpeningNarration", () => {
  it("forwards intro chunks immediately while generating narration", async () => {
    const storage = createStorage();
    const provider = createProvider();
    const onNarrativeChunk = vi.fn();

    const entry = await generateOpeningNarration(
      "game-1",
      defaultAIConfig,
      createSettings(),
      storage,
      provider,
      onNarrativeChunk,
    );

    expect(entry?.text).toBe("You wake up somewhere unpleasant.");
    expect(storage.appendHistory).toHaveBeenCalledOnce();
    expect(onNarrativeChunk).toHaveBeenNthCalledWith(1, "You wake up ");
    expect(onNarrativeChunk).toHaveBeenNthCalledWith(2, "somewhere unpleasant.");
  });

  it("still emits intro chunks even if persisting the history entry later fails", async () => {
    const storage = createStorage();
    const provider = createProvider();
    const onNarrativeChunk = vi.fn();

    (storage.appendHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("storage failed"),
    );

    await expect(
      generateOpeningNarration(
        "game-1",
        defaultAIConfig,
        createSettings(),
        storage,
        provider,
        onNarrativeChunk,
      ),
    ).rejects.toThrow("storage failed");

    expect(onNarrativeChunk).toHaveBeenNthCalledWith(1, "You wake up ");
    expect(onNarrativeChunk).toHaveBeenNthCalledWith(2, "somewhere unpleasant.");
  });
});
