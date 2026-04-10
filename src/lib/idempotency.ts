import type { Redis } from "@upstash/redis";

const DEFAULT_LOCK_TTL = 30; // seconds — processing timeout
const DEFAULT_RESULT_TTL = 300; // seconds (5 min) — cache completed results

export class IdempotencyGuard {
  constructor(private redis: Redis) {}

  /**
   * Try to acquire the lock for this turn.
   * Returns true if acquired (proceed with turn).
   * Returns false if already processed or in-progress (reject as duplicate).
   */
  async acquireTurnLock(
    gameId: string,
    turnId: string,
    ttlSeconds: number = DEFAULT_LOCK_TTL,
  ): Promise<boolean> {
    const key = `turn-lock:${gameId}:${turnId}`;
    const result = await this.redis.set(key, "locked", {
      nx: true,
      ex: ttlSeconds,
    });
    return result === "OK";
  }

  /** Release the lock (call on completion or error). */
  async releaseTurnLock(gameId: string, turnId: string): Promise<void> {
    const key = `turn-lock:${gameId}:${turnId}`;
    await this.redis.del(key);
  }

  /** Mark turn as completed (so retries get the cached result). */
  async completeTurn(
    gameId: string,
    turnId: string,
    result: string,
    ttlSeconds: number = DEFAULT_RESULT_TTL,
  ): Promise<void> {
    const key = `turn-result:${gameId}:${turnId}`;
    await this.redis.set(key, result, { ex: ttlSeconds });
  }

  /** Get cached result for a completed turn. */
  async getTurnResult(
    gameId: string,
    turnId: string,
  ): Promise<string | null> {
    const key = `turn-result:${gameId}:${turnId}`;
    return this.redis.get<string>(key);
  }
}
