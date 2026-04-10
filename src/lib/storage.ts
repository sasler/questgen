import { Redis } from "@upstash/redis";
import type {
  GameWorld,
  PlayerState,
  TurnEntry,
  GameSettings,
  GameMetadata,
} from "@/types";

// Key prefixes
const KEYS = {
  world: (id: string) => `world:${id}`,
  player: (id: string) => `player:${id}`,
  history: (id: string) => `history:${id}`,
  settings: (id: string) => `settings:${id}`,
  metadata: (id: string) => `metadata:${id}`,
  userGames: (userId: string) => `games:${userId}`,
} as const;

const HISTORY_CAP = 100;

export interface IGameStorage {
  saveWorld(gameId: string, world: GameWorld): Promise<void>;
  getWorld(gameId: string): Promise<GameWorld | null>;

  savePlayerState(gameId: string, state: PlayerState): Promise<void>;
  getPlayerState(gameId: string): Promise<PlayerState | null>;
  updatePlayerState(
    gameId: string,
    state: PlayerState,
    expectedVersion: number
  ): Promise<boolean>;

  appendHistory(gameId: string, entry: TurnEntry): Promise<void>;
  getHistory(gameId: string, limit?: number): Promise<TurnEntry[]>;

  saveSettings(gameId: string, settings: GameSettings): Promise<void>;
  getSettings(gameId: string): Promise<GameSettings | null>;

  saveMetadata(gameId: string, metadata: GameMetadata): Promise<void>;
  getMetadata(gameId: string): Promise<GameMetadata | null>;

  addGameToUser(userId: string, gameId: string): Promise<void>;
  removeGameFromUser(userId: string, gameId: string): Promise<void>;
  getUserGames(userId: string): Promise<string[]>;

  deleteGame(gameId: string, userId: string): Promise<void>;
  gameExists(gameId: string): Promise<boolean>;
}

// Singleton Redis instance for production
let redisInstance: Redis | null = null;

function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redisInstance;
}

export class GameStorage implements IGameStorage {
  constructor(private redis: Redis = getRedis()) {}

  // --- World ---

  async saveWorld(gameId: string, world: GameWorld): Promise<void> {
    await this.redis.set(KEYS.world(gameId), JSON.stringify(world));
  }

  async getWorld(gameId: string): Promise<GameWorld | null> {
    const data = await this.redis.get<string>(KEYS.world(gameId));
    if (data === null || data === undefined) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  // --- Player State ---

  async savePlayerState(gameId: string, state: PlayerState): Promise<void> {
    await this.redis.set(KEYS.player(gameId), JSON.stringify(state));
  }

  async getPlayerState(gameId: string): Promise<PlayerState | null> {
    const data = await this.redis.get<string>(KEYS.player(gameId));
    if (data === null || data === undefined) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  async updatePlayerState(
    gameId: string,
    state: PlayerState,
    expectedVersion: number
  ): Promise<boolean> {
    const key = KEYS.player(gameId);
    const current = await this.getPlayerState(gameId);

    if (!current) return false;
    if (current.stateVersion !== expectedVersion) return false;

    const updated = { ...state, stateVersion: expectedVersion + 1 };
    await this.redis.set(key, JSON.stringify(updated));
    return true;
  }

  // --- History ---

  async appendHistory(gameId: string, entry: TurnEntry): Promise<void> {
    const key = KEYS.history(gameId);
    await this.redis.lpush(key, JSON.stringify(entry));
    await this.redis.ltrim(key, 0, HISTORY_CAP - 1);
  }

  async getHistory(gameId: string, limit?: number): Promise<TurnEntry[]> {
    const key = KEYS.history(gameId);
    const end = limit ? limit - 1 : HISTORY_CAP - 1;
    const raw = await this.redis.lrange(key, 0, end);
    return raw.map((item) =>
      typeof item === "string" ? JSON.parse(item) : item
    );
  }

  // --- Settings ---

  async saveSettings(gameId: string, settings: GameSettings): Promise<void> {
    await this.redis.set(KEYS.settings(gameId), JSON.stringify(settings));
  }

  async getSettings(gameId: string): Promise<GameSettings | null> {
    const data = await this.redis.get<string>(KEYS.settings(gameId));
    if (data === null || data === undefined) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  // --- Metadata ---

  async saveMetadata(gameId: string, metadata: GameMetadata): Promise<void> {
    await this.redis.set(KEYS.metadata(gameId), JSON.stringify(metadata));
  }

  async getMetadata(gameId: string): Promise<GameMetadata | null> {
    const data = await this.redis.get<string>(KEYS.metadata(gameId));
    if (data === null || data === undefined) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  // --- Game Index (per user) ---

  async addGameToUser(userId: string, gameId: string): Promise<void> {
    const key = KEYS.userGames(userId);
    const games = await this.getUserGames(userId);
    if (!games.includes(gameId)) {
      games.push(gameId);
      await this.redis.set(key, JSON.stringify(games));
    }
  }

  async removeGameFromUser(userId: string, gameId: string): Promise<void> {
    const key = KEYS.userGames(userId);
    const games = await this.getUserGames(userId);
    const filtered = games.filter((id) => id !== gameId);
    await this.redis.set(key, JSON.stringify(filtered));
  }

  async getUserGames(userId: string): Promise<string[]> {
    const data = await this.redis.get<string>(KEYS.userGames(userId));
    if (data === null || data === undefined) return [];
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  // --- Bulk Operations ---

  async deleteGame(gameId: string, userId: string): Promise<void> {
    await this.redis.del(
      KEYS.world(gameId),
      KEYS.player(gameId),
      KEYS.history(gameId),
      KEYS.settings(gameId),
      KEYS.metadata(gameId)
    );
    await this.removeGameFromUser(userId, gameId);
  }

  async gameExists(gameId: string): Promise<boolean> {
    const count = await this.redis.exists(KEYS.metadata(gameId));
    return count > 0;
  }
}

// Default singleton export
let storageInstance: IGameStorage | null = null;

export function getStorage(): IGameStorage {
  if (!storageInstance) {
    storageInstance = new GameStorage();
  }
  return storageInstance;
}
