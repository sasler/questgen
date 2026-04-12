import { describe, expect, it } from "vitest";
import { renderEntityTables } from "./progression";
import type { GameWorld, PlayerState } from "@/types";

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
    turnCount: 3,
    stateVersion: 1,
  };
}

describe("renderEntityTables", () => {
  it("includes spoiler-rich interactable, puzzle, and lock dependency detail", () => {
    const output = renderEntityTables(makeWorld(), makePlayer());

    expect(output).toContain("CURRENT ROOM INTERACTABLES");
    expect(output).toContain("WORLD INTERACTABLES");
    expect(output).toContain("Relay Console");
    expect(output).toContain("relay console, console");
    expect(output).toContain("Airlock Door");
    expect(output).toContain("Power Grid Fix");
    expect(output).toContain("install");
    expect(output).toContain("Power Cell");
    expect(output).toContain("offline → online");
    expect(output).toContain("airlock-lock");
    expect(output).toContain("puzzle: Power Grid Fix");
    expect(output).toContain("sealed → open");
    expect(output).toContain("missing Power Cell");
  });
});
