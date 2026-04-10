import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InventoryPanel } from "./InventoryPanel";
import { RoomInfoPanel } from "./RoomInfoPanel";
import type { Item, NPC, Room, Direction } from "@/types";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeItem(overrides?: Partial<Item>): Item {
  return {
    id: "item-1",
    name: "Rusty Key",
    description: "A key covered in rust.",
    portable: true,
    properties: {},
    ...overrides,
  };
}

function makeRoom(overrides?: Partial<Room>): Room {
  return {
    id: "room-1",
    name: "Grand Foyer",
    description: "A large room with marble floors.",
    itemIds: [],
    npcIds: [],
    ...overrides,
  };
}

function makeNPC(overrides?: Partial<NPC>): NPC {
  return {
    id: "npc-1",
    name: "Captain Zark",
    description: "A grizzled space captain.",
    dialogue: { greeting: "Ahoy!" },
    state: "idle",
    ...overrides,
  };
}

type Exit = {
  direction: Direction;
  roomName: string;
  locked: boolean;
  hidden: boolean;
};

function makeExit(overrides?: Partial<Exit>): Exit {
  return {
    direction: "north",
    roomName: "Hallway",
    locked: false,
    hidden: false,
    ...overrides,
  };
}

// ===========================================================================
// InventoryPanel
// ===========================================================================

describe("InventoryPanel", () => {
  it("renders the empty state when no items", () => {
    render(<InventoryPanel items={[]} />);
    expect(
      screen.getByText(/your pockets are empty/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/remarkably/i)).toBeInTheDocument();
  });

  it("shows item count in the title area", () => {
    const items = [
      makeItem({ id: "a", name: "Torch" }),
      makeItem({ id: "b", name: "Map" }),
      makeItem({ id: "c", name: "Rope" }),
    ];
    render(<InventoryPanel items={items} />);
    expect(screen.getByText(/\[3 items\]/)).toBeInTheDocument();
  });

  it("renders each item name", () => {
    const items = [
      makeItem({ id: "a", name: "Torch" }),
      makeItem({ id: "b", name: "Old Map" }),
    ];
    render(<InventoryPanel items={items} />);
    expect(screen.getByText(/Torch/)).toBeInTheDocument();
    expect(screen.getByText(/Old Map/)).toBeInTheDocument();
  });

  it("shows item description on hover", async () => {
    const user = userEvent.setup();
    const items = [makeItem({ id: "a", name: "Torch", description: "A flickering flame." })];
    render(<InventoryPanel items={items} />);

    const itemEl = screen.getByText(/Torch/);
    await user.hover(itemEl);

    expect(screen.getByText(/A flickering flame\./)).toBeInTheDocument();
  });

  it("calls onItemClick when an item is clicked", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    const items = [makeItem({ id: "key-1", name: "Rusty Key" })];
    render(<InventoryPanel items={items} onItemClick={handler} />);

    await user.click(screen.getByText(/Rusty Key/));
    expect(handler).toHaveBeenCalledWith("key-1");
  });

  it("does not crash when clicked without onItemClick", async () => {
    const user = userEvent.setup();
    const items = [makeItem({ id: "a", name: "Torch" })];
    render(<InventoryPanel items={items} />);

    await user.click(screen.getByText(/Torch/));
    // No error thrown — pass
  });

  it("shows [0 items] when empty", () => {
    render(<InventoryPanel items={[]} />);
    expect(screen.getByText(/\[0 items\]/)).toBeInTheDocument();
  });
});

// ===========================================================================
// RoomInfoPanel
// ===========================================================================

describe("RoomInfoPanel", () => {
  it("shows the null room state", () => {
    render(<RoomInfoPanel room={null} items={[]} npcs={[]} exits={[]} />);
    expect(
      screen.getByText(/you appear to be nowhere/i),
    ).toBeInTheDocument();
  });

  it("renders the room name as a header", () => {
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={[]} />,
    );
    expect(screen.getByText("Grand Foyer")).toBeInTheDocument();
  });

  it("renders the room description", () => {
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={[]} />,
    );
    expect(
      screen.getByText(/marble floors/i),
    ).toBeInTheDocument();
  });

  it("lists visible items in the room", () => {
    const items = [
      makeItem({ id: "a", name: "rusty key" }),
      makeItem({ id: "b", name: "old map" }),
    ];
    render(
      <RoomInfoPanel room={makeRoom()} items={items} npcs={[]} exits={[]} />,
    );
    expect(screen.getByText(/You see:/i)).toBeInTheDocument();
    expect(screen.getByText(/rusty key/)).toBeInTheDocument();
    expect(screen.getByText(/old map/)).toBeInTheDocument();
  });

  it("lists NPCs present in the room", () => {
    const npcs = [
      makeNPC({ id: "a", name: "Captain Zark" }),
      makeNPC({ id: "b", name: "Robot Butler" }),
    ];
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={npcs} exits={[]} />,
    );
    expect(screen.getByText(/Present:/i)).toBeInTheDocument();
    expect(screen.getByText(/Captain Zark/)).toBeInTheDocument();
    expect(screen.getByText(/Robot Butler/)).toBeInTheDocument();
  });

  it("shows exits with direction and room name", () => {
    const exits = [
      makeExit({ direction: "north", roomName: "Hallway" }),
      makeExit({ direction: "south", roomName: "Lobby" }),
    ];
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={exits} />,
    );
    expect(screen.getByText(/Exits:/i)).toBeInTheDocument();
    expect(screen.getByText(/north/)).toBeInTheDocument();
    expect(screen.getByText(/Hallway/)).toBeInTheDocument();
    expect(screen.getByText(/south/)).toBeInTheDocument();
    expect(screen.getByText(/Lobby/)).toBeInTheDocument();
  });

  it("marks locked exits", () => {
    const exits = [
      makeExit({ direction: "east", roomName: "Vault", locked: true }),
    ];
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={exits} />,
    );
    expect(screen.getByText(/🔒|LOCKED/)).toBeInTheDocument();
  });

  it("hides hidden exits", () => {
    const exits = [
      makeExit({ direction: "north", roomName: "Hallway", hidden: false }),
      makeExit({ direction: "down", roomName: "Secret Lair", hidden: true }),
    ];
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={exits} />,
    );
    expect(screen.getByText(/Hallway/)).toBeInTheDocument();
    expect(screen.queryByText(/Secret Lair/)).not.toBeInTheDocument();
  });

  it("does not show items section when no items", () => {
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={[]} />,
    );
    expect(screen.queryByText(/You see:/i)).not.toBeInTheDocument();
  });

  it("does not show NPCs section when no npcs", () => {
    render(
      <RoomInfoPanel room={makeRoom()} items={[]} npcs={[]} exits={[]} />,
    );
    expect(screen.queryByText(/Present:/i)).not.toBeInTheDocument();
  });
});
