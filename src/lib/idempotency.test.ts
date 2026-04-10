import { describe, it, expect, vi, beforeEach } from "vitest";
import { IdempotencyGuard } from "./idempotency";

// ---------------------------------------------------------------------------
// Mock Redis that stores data in-memory with SET NX / EX support
// ---------------------------------------------------------------------------
function createMockRedis() {
  const store = new Map<string, string>();

  return {
    set: vi.fn(
      async (
        key: string,
        value: string,
        options?: { nx?: boolean; ex?: number },
      ) => {
        if (options?.nx && store.has(key)) {
          return null; // NX failed — key already exists
        }
        store.set(key, value);
        return "OK";
      },
    ),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const k of keys) {
        if (store.delete(k)) removed++;
      }
      return removed;
    }),
    // expose for assertions
    _store: store,
  };
}

type MockRedis = ReturnType<typeof createMockRedis>;

describe("IdempotencyGuard", () => {
  let redis: MockRedis;
  let guard: IdempotencyGuard;

  beforeEach(() => {
    redis = createMockRedis();
    guard = new IdempotencyGuard(redis as never);
  });

  // 1. acquireTurnLock succeeds on first call
  it("acquireTurnLock succeeds on first call", async () => {
    const acquired = await guard.acquireTurnLock("game1", "turn1");
    expect(acquired).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      "turn-lock:game1:turn1",
      "locked",
      { nx: true, ex: 30 },
    );
  });

  // 2. acquireTurnLock fails on duplicate
  it("acquireTurnLock fails on duplicate", async () => {
    await guard.acquireTurnLock("game1", "turn1");
    const second = await guard.acquireTurnLock("game1", "turn1");
    expect(second).toBe(false);
  });

  // 3. completeTurn stores result
  it("completeTurn stores result", async () => {
    await guard.completeTurn("game1", "turn1", "You found a sword!");
    expect(redis.set).toHaveBeenCalledWith(
      "turn-result:game1:turn1",
      "You found a sword!",
      { ex: 300 },
    );
  });

  // 4. getTurnResult retrieves cached result
  it("getTurnResult retrieves cached result", async () => {
    await guard.completeTurn("game1", "turn1", "You found a sword!");
    const result = await guard.getTurnResult("game1", "turn1");
    expect(result).toBe("You found a sword!");
  });

  // 5. getTurnResult returns null for unknown turn
  it("getTurnResult returns null for unknown turn", async () => {
    const result = await guard.getTurnResult("game1", "unknown");
    expect(result).toBeNull();
  });

  // 6. releaseTurnLock removes the lock
  it("releaseTurnLock removes the lock", async () => {
    await guard.acquireTurnLock("game1", "turn1");
    await guard.releaseTurnLock("game1", "turn1");
    expect(redis.del).toHaveBeenCalledWith("turn-lock:game1:turn1");

    // After release, acquiring again should succeed
    const reacquired = await guard.acquireTurnLock("game1", "turn1");
    expect(reacquired).toBe(true);
  });

  it("acquireTurnLock accepts custom TTL", async () => {
    await guard.acquireTurnLock("game1", "turn1", 60);
    expect(redis.set).toHaveBeenCalledWith(
      "turn-lock:game1:turn1",
      "locked",
      { nx: true, ex: 60 },
    );
  });

  it("completeTurn accepts custom TTL", async () => {
    await guard.completeTurn("game1", "turn1", "result", 600);
    expect(redis.set).toHaveBeenCalledWith(
      "turn-result:game1:turn1",
      "result",
      { ex: 600 },
    );
  });
});
