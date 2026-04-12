import { describe, expect, it } from "vitest";
import { validateWorld } from "@/engine";
import type { Direction, GameGenerationRequest } from "@/types";
import { buildDeterministicWorld } from "./deterministic-world";

function collectRoomDirections(world: ReturnType<typeof buildDeterministicWorld>) {
  const exitsByRoom = new Map<string, Direction[]>();

  for (const connection of world.connections) {
    exitsByRoom.set(connection.fromRoomId, [
      ...(exitsByRoom.get(connection.fromRoomId) ?? []),
      connection.direction,
    ]);
    exitsByRoom.set(connection.toRoomId, [
      ...(exitsByRoom.get(connection.toRoomId) ?? []),
      connection.reverseDirection,
    ]);
  }

  return exitsByRoom;
}

function makeRequest(overrides: Partial<GameGenerationRequest> = {}): GameGenerationRequest {
  return {
    description: "A bureaucratic sci-fi mystery aboard a failing space station",
    size: "medium",
    genre: "science fiction comedy",
    ...overrides,
  };
}

describe("buildDeterministicWorld", () => {
  it("returns the same world for the same request seed", () => {
    const request = makeRequest();

    const first = buildDeterministicWorld(request, "seed-123");
    const second = buildDeterministicWorld(request, "seed-123");

    expect(second).toEqual(first);
  });

  it("returns a different layout for a different seed", () => {
    const request = makeRequest();

    const first = buildDeterministicWorld(request, "seed-123");
    const second = buildDeterministicWorld(request, "seed-456");

    expect(second).not.toEqual(first);
  });

  it("builds a valid, solvable world", () => {
    const world = buildDeterministicWorld(makeRequest({ size: "small" }), "seed-123");
    const validation = validateWorld(world);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("uses each corridor as a single bidirectional connection", () => {
    const world = buildDeterministicWorld(makeRequest({ size: "small" }), "seed-123");
    const seenPairs = new Set<string>();

    for (const connection of world.connections) {
      const pairKey = [connection.fromRoomId, connection.toRoomId].sort().join("::");
      expect(seenPairs.has(pairKey)).toBe(false);
      seenPairs.add(pairKey);
    }
  });

  it("never gives a room duplicate directions or more than six exits", () => {
    const world = buildDeterministicWorld(makeRequest({ size: "epic" }), "seed-123");
    const exitsByRoom = collectRoomDirections(world);

    for (const directions of exitsByRoom.values()) {
      expect(directions.length).toBeLessThanOrEqual(6);
      expect(new Set(directions).size).toBe(directions.length);
    }
  });

  it("stays valid across a range of larger random-looking seeds", () => {
    for (const size of ["large", "epic"] as const) {
      for (let index = 0; index < 200; index += 1) {
        const world = buildDeterministicWorld(makeRequest({ size }), `stress-seed-${size}-${index}`);
        const validation = validateWorld(world);

        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      }
    }
  });

  it("includes explicit puzzle and lock solution descriptions", () => {
    const world = buildDeterministicWorld(makeRequest({ size: "small" }), "seed-123");
    const puzzle = Object.values(world.puzzles)[0];
    const lock = Object.values(world.locks)[0];

    expect(puzzle.solution.description).toMatch(/\S/);
    expect(lock.conditionDescription).toMatch(/\S/);
    expect(world.winCondition.description).toMatch(/\S/);
  });

  it("creates explicit interactable targets for the critical puzzle and lock", () => {
    const world = buildDeterministicWorld(makeRequest({ size: "small" }), "seed-123");
    const puzzle = Object.values(world.puzzles)[0];
    const lock = Object.values(world.locks)[0];
    const puzzleTarget = world.interactables[puzzle.solution.targetInteractableId!];
    const lockTarget = world.interactables[lock.targetInteractableId!];

    expect(puzzleTarget).toBeDefined();
    expect(puzzleTarget.roomId).toBe(puzzle.roomId);
    expect(puzzleTarget.aliases.length).toBeGreaterThan(0);
    expect(lockTarget).toBeDefined();
    expect(lockTarget.aliases.length).toBeGreaterThan(0);
  });
});
