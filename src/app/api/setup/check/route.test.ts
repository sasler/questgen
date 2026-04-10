import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/auth before importing route
vi.mock("@/lib/auth", () => ({
  isAuthConfigured: vi.fn(),
}));

// Mock @upstash/redis with a real class so `new Redis(...)` works
vi.mock("@upstash/redis", () => {
  class MockRedis {
    async ping() {
      return "PONG";
    }
  }
  return { Redis: MockRedis };
});

import { isAuthConfigured } from "@/lib/auth";
import { GET } from "./route";

const mockIsAuthConfigured = vi.mocked(isAuthConfigured);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/setup/check", () => {
  it("returns auth: false when GITHUB_ID is missing", async () => {
    mockIsAuthConfigured.mockReturnValue(false);
    vi.stubEnv("AUTH_SECRET", "secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const res = await GET();
    const data = await res.json();

    expect(data.auth).toBe(false);
  });

  it("returns auth: true when GITHUB_ID and GITHUB_SECRET are set", async () => {
    mockIsAuthConfigured.mockReturnValue(true);
    vi.stubEnv("GITHUB_ID", "id");
    vi.stubEnv("GITHUB_SECRET", "secret");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const res = await GET();
    const data = await res.json();

    expect(data.auth).toBe(true);
  });

  it("returns secret: true when AUTH_SECRET is set", async () => {
    mockIsAuthConfigured.mockReturnValue(false);
    vi.stubEnv("AUTH_SECRET", "my-secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const res = await GET();
    const data = await res.json();

    expect(data.secret).toBe(true);
  });

  it("returns redis: false when UPSTASH vars are missing", async () => {
    mockIsAuthConfigured.mockReturnValue(false);
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const res = await GET();
    const data = await res.json();

    expect(data.redis).toBe(false);
    expect(data.redisConnected).toBe(false);
  });

  it("returns allConfigured: true when everything is set", async () => {
    mockIsAuthConfigured.mockReturnValue(true);
    vi.stubEnv("AUTH_SECRET", "my-secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token123");

    const res = await GET();
    const data = await res.json();

    expect(data.auth).toBe(true);
    expect(data.secret).toBe(true);
    expect(data.redis).toBe(true);
    expect(data.redisConnected).toBe(true);
    expect(data.allConfigured).toBe(true);
  });
});
