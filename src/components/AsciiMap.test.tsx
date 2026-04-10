import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AsciiMap } from "./AsciiMap";
import type { Room, Connection } from "@/types";

function makeRoom(id: string, name: string): Room {
  return { id, name, description: `${name} description`, itemIds: [], npcIds: [] };
}

describe("AsciiMap", () => {
  const lobby = makeRoom("lobby", "Lobby");
  const hallway = makeRoom("hallway", "Hallway");
  const office = makeRoom("office", "Office");
  const lab = makeRoom("lab", "Lab");

  const connections: Connection[] = [
    {
      fromRoomId: "lobby",
      toRoomId: "hallway",
      direction: "east",
      reverseDirection: "west",
    },
    {
      fromRoomId: "lobby",
      toRoomId: "office",
      direction: "south",
      reverseDirection: "north",
    },
    {
      fromRoomId: "hallway",
      toRoomId: "lab",
      direction: "south",
      reverseDirection: "north",
    },
  ];

  it("renders current room highlighted with asterisks", () => {
    render(
      <AsciiMap
        rooms={[lobby]}
        connections={[]}
        visitedRoomIds={["lobby"]}
        currentRoomId="lobby"
      />,
    );

    const pre = screen.getByRole("img");
    expect(pre.textContent).toContain("*");
    expect(pre.textContent).toContain("Lobby");
  });

  it("only shows visited rooms (fog of war)", () => {
    render(
      <AsciiMap
        rooms={[lobby, hallway, office, lab]}
        connections={connections}
        visitedRoomIds={["lobby", "hallway"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    expect(text).toContain("Lobby");
    expect(text).toContain("Hallway");
    expect(text).not.toContain("Office");
    expect(text).not.toContain("Lab");
  });

  it("shows connections between visited rooms", () => {
    render(
      <AsciiMap
        rooms={[lobby, hallway]}
        connections={connections}
        visitedRoomIds={["lobby", "hallway"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    // Horizontal connection between lobby and hallway (east)
    expect(text).toContain("---");
  });

  it("handles single room (start of game)", () => {
    render(
      <AsciiMap
        rooms={[lobby]}
        connections={[]}
        visitedRoomIds={["lobby"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    expect(text).toContain("Lobby");
    // No connections rendered
    expect(text).not.toContain("---");
  });

  it("handles room with no connections", () => {
    const isolated = makeRoom("isolated", "Isolated");
    render(
      <AsciiMap
        rooms={[lobby, isolated]}
        connections={[]}
        visitedRoomIds={["lobby", "isolated"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    expect(text).toContain("Lobby");
    expect(text).toContain("Isolated");
  });

  it("current room marker is visible", () => {
    render(
      <AsciiMap
        rooms={[lobby, hallway]}
        connections={connections}
        visitedRoomIds={["lobby", "hallway"]}
        currentRoomId="hallway"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    // Current room should have asterisks
    expect(text).toContain("*Hallway*");
    // Non-current visited room should not have asterisks around its name
    expect(text).not.toContain("*Lobby*");
  });

  it("truncates long room names", () => {
    const longNameRoom = makeRoom("long", "TheIncrediblyLongRoomName");
    render(
      <AsciiMap
        rooms={[longNameRoom]}
        connections={[]}
        visitedRoomIds={["long"]}
        currentRoomId="long"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    // Should not contain the full long name
    expect(text).not.toContain("TheIncrediblyLongRoomName");
    // Should contain a truncated version (current room uses *name*, so name is shorter)
    expect(text).toContain("TheInc..");
  });

  it("shows vertical connections for north/south", () => {
    render(
      <AsciiMap
        rooms={[lobby, office]}
        connections={connections}
        visitedRoomIds={["lobby", "office"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    expect(text).toContain("|");
  });

  it("shows locked connections with lock marker", () => {
    const lockedConn: Connection[] = [
      {
        fromRoomId: "lobby",
        toRoomId: "hallway",
        direction: "east",
        reverseDirection: "west",
        lockId: "lock1",
      },
    ];

    render(
      <AsciiMap
        rooms={[lobby, hallway]}
        connections={lockedConn}
        visitedRoomIds={["lobby", "hallway"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    expect(text).toContain("X");
  });

  it("uses provided roomPositions when given", () => {
    render(
      <AsciiMap
        rooms={[lobby, hallway]}
        connections={connections}
        visitedRoomIds={["lobby", "hallway"]}
        currentRoomId="lobby"
        roomPositions={{
          lobby: { x: 0, y: 0 },
          hallway: { x: 1, y: 0 },
        }}
      />,
    );

    const text = screen.getByRole("img").textContent!;
    expect(text).toContain("Lobby");
    expect(text).toContain("Hallway");
  });

  it("renders up/down connections with markers", () => {
    const upConn: Connection[] = [
      {
        fromRoomId: "lobby",
        toRoomId: "hallway",
        direction: "up",
        reverseDirection: "down",
      },
    ];

    render(
      <AsciiMap
        rooms={[lobby, hallway]}
        connections={upConn}
        visitedRoomIds={["lobby", "hallway"]}
        currentRoomId="lobby"
      />,
    );

    const text = screen.getByRole("img").textContent!;
    // Up/down rooms are placed at same position; markers should be present
    expect(text).toContain("^");
  });
});
