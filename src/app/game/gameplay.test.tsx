import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "game-123" }),
}));

vi.mock("@/engine", () => ({
  getAvailableExits: vi.fn(() => [
    { direction: "north", roomName: "Library", locked: false, hidden: false },
    { direction: "east", roomName: "Garden", locked: true, hidden: false },
  ]),
}));

// ── Test fixtures ────────────────────────────────────────────────

import type {
  GameState,
  GameWorld,
  PlayerState,
  TurnEntry,
  Room,
  Item,
  NPC,
  Connection,
} from "@/types";

const rooms: Record<string, Room> = {
  "room-1": {
    id: "room-1",
    name: "Entrance Hall",
    description: "A grand entrance hall with marble floors.",
    itemIds: ["item-2"],
    npcIds: ["npc-1"],
    firstVisitText: "You step into the grand entrance hall.",
  },
  "room-2": {
    id: "room-2",
    name: "Library",
    description: "Dusty bookshelves line the walls.",
    itemIds: [],
    npcIds: [],
  },
};

const items: Record<string, Item> = {
  "item-1": {
    id: "item-1",
    name: "Brass Key",
    description: "A small brass key.",
    portable: true,
    properties: {},
  },
  "item-2": {
    id: "item-2",
    name: "Old Map",
    description: "A faded map of the area.",
    portable: true,
    properties: {},
  },
};

const npcs: Record<string, NPC> = {
  "npc-1": {
    id: "npc-1",
    name: "Bob",
    description: "A friendly innkeeper.",
    dialogue: { greeting: "Welcome!" },
    state: "idle",
  },
};

const connections: Connection[] = [
  {
    fromRoomId: "room-1",
    toRoomId: "room-2",
    direction: "north",
    reverseDirection: "south",
  },
];

const world: GameWorld = {
  rooms,
  items,
  npcs,
  connections,
  puzzles: {},
  locks: {},
  winCondition: {
    type: "reach_room",
    targetId: "room-2",
    description: "Reach the library",
  },
  startRoomId: "room-1",
};

const player: PlayerState = {
  currentRoomId: "room-1",
  inventory: ["item-1"],
  visitedRooms: ["room-1"],
  flags: {},
  turnCount: 0,
  stateVersion: 1,
};

const history: TurnEntry[] = [];

const gameState: GameState = {
  metadata: {
    id: "game-123",
    userId: "user-1",
    title: "Test Adventure",
    description: "A test adventure",
    size: "small",
    createdAt: Date.now(),
    lastPlayedAt: Date.now(),
    turnCount: 0,
    completed: false,
  },
  world,
  player,
  history,
  settings: {
    generationModel: "gpt-4o",
    gameplayModel: "gpt-4o-mini",
    responseLength: "moderate",
    provider: "copilot",
  },
};

function mockFetchSuccess(state: GameState = gameState) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => state,
  });
}

function mockFetchWithTurn(
  state: GameState = gameState,
  turnResponse: Record<string, unknown> = {
    success: true,
    narrative: "You look around the hall.",
    actionResults: [],
    newPlayerState: { ...player, turnCount: 1 },
    worldChanged: false,
    gameWon: false,
  },
) {
  return vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => state })
    .mockResolvedValueOnce({ ok: true, json: async () => turnResponse });
}

// ── Tests ────────────────────────────────────────────────────────

// Lazy import so mocks are set up first
let GamePage: typeof import("./[id]/page").default;

beforeEach(async () => {
  vi.stubGlobal("crypto", {
    randomUUID: () => "test-uuid-1234",
  });
  Element.prototype.scrollIntoView = vi.fn();
  // Reset module between tests for fresh state
  vi.resetModules();
  const mod = await import("./[id]/page");
  GamePage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Game Page", () => {
  it("shows loading state on mount", async () => {
    // Never resolving fetch keeps loading state visible
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<GamePage />);
    });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders game layout after fetch", async () => {
    global.fetch = mockFetchSuccess();

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("terminal")).toBeInTheDocument();
    });

    // Should render the command input
    expect(screen.getByLabelText("Command input")).toBeInTheDocument();

    // Should render room info
    expect(screen.getByText("Entrance Hall")).toBeInTheDocument();

    // Should render inventory item
    expect(screen.getByText("Brass Key")).toBeInTheDocument();
  });

  it("terminal shows history entries", async () => {
    const stateWithHistory: GameState = {
      ...gameState,
      player: { ...player, turnCount: 2 },
      history: [
        {
          turnId: "t1",
          role: "player",
          text: "look around",
          timestamp: Date.now(),
        },
        {
          turnId: "t2",
          role: "narrator",
          text: "You see a grand entrance hall.",
          timestamp: Date.now(),
        },
      ],
    };

    global.fetch = mockFetchSuccess(stateWithHistory);

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("You see a grand entrance hall."),
      ).toBeInTheDocument();
    });
  });

  it("command input submits player turn", async () => {
    const user = userEvent.setup();
    global.fetch = mockFetchWithTurn();

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Command input")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Command input");
    await user.type(input, "look around{Enter}");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    const turnCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(turnCall[0]).toBe("/api/game/game-123/turn");
    expect(JSON.parse(turnCall[1].body)).toMatchObject({
      input: "look around",
      turnId: "test-uuid-1234",
    });
  });

  it("shows loading during turn processing", async () => {
    const user = userEvent.setup();
    // First call resolves (game load), second never resolves (turn)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => gameState })
      .mockReturnValueOnce(new Promise(() => {}));

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Command input")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Command input");
    await user.type(input, "look{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
    });
  });

  it("updates state after turn response", async () => {
    const user = userEvent.setup();
    global.fetch = mockFetchWithTurn();

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Command input")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Command input");
    await user.type(input, "look around{Enter}");

    await waitFor(() => {
      expect(
        screen.getByText("You look around the hall."),
      ).toBeInTheDocument();
    });
  });

  it("shows victory message when game won", async () => {
    const user = userEvent.setup();
    const wonResponse = {
      success: true,
      narrative: "You found the ancient library!",
      actionResults: [],
      newPlayerState: {
        ...player,
        turnCount: 1,
        currentRoomId: "room-2",
        visitedRooms: ["room-1", "room-2"],
      },
      worldChanged: false,
      gameWon: true,
    };

    global.fetch = mockFetchWithTurn(gameState, wonResponse);

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Command input")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Command input");
    await user.type(input, "go north{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/victory/i)).toBeInTheDocument();
    });

    // Input should be disabled after win
    expect(screen.getByLabelText("Command input")).toBeDisabled();
  });

  it("handles fetch error gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    });

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load game")).toBeInTheDocument();
    });
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("passes correct props to AsciiMap (visitedRooms, currentRoom)", async () => {
    const { getAvailableExits } = await import("@/engine");

    global.fetch = mockFetchSuccess();

    await act(async () => {
      render(<GamePage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("terminal")).toBeInTheDocument();
    });

    // The map should be rendered — check for the role="img" element
    expect(screen.getByRole("img", { name: "Game map" })).toBeInTheDocument();

    // getAvailableExits should have been called with world and player
    expect(getAvailableExits).toHaveBeenCalledWith(
      expect.objectContaining({ rooms, connections }),
      expect.objectContaining({
        currentRoomId: "room-1",
        visitedRooms: ["room-1"],
      }),
    );
  });
});
