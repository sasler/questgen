import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/world-gen", () => ({
  generateWorld: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { generateWorld } from "@/lib/world-gen";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedGenerateWorld = vi.mocked(generateWorld);

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/game/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const validRequest = {
  description: "A mystery on a space station",
  size: "medium" as const,
  genre: "sci-fi",
};

const validSettings = {
  generationModel: "gpt-4o",
  gameplayModel: "gpt-4o-mini",
  responseLength: "moderate" as const,
  provider: "copilot" as const,
};

const validBody = { request: validRequest, settings: validSettings };

const mockSession = {
  user: { id: "user-123", email: "test@example.com", name: "Test User" },
  accessToken: "gh-token-abc",
  expires: "2099-01-01T00:00:00.000Z",
};

describe("POST /api/game/new", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockedGenerateWorld).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing/invalid", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when request description is empty", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);

    const res = await POST(
      makeRequest({
        request: { description: "", size: "medium" },
        settings: validSettings,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 201 with gameId on success", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-456",
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.gameId).toBe("game-456");
  });

  it("passes correct aiConfig for copilot mode", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-789",
    });

    await POST(makeRequest(validBody));

    expect(mockedGenerateWorld).toHaveBeenCalledWith(
      validRequest,
      validSettings,
      "user-123",
      {
        mode: "copilot",
        githubToken: "gh-token-abc",
      },
    );
  });

  it("passes correct aiConfig for byok mode", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-byok",
    });

    const byokSettings = {
      ...validSettings,
      provider: "byok" as const,
      byokConfig: {
        type: "openai" as const,
        baseUrl: "https://api.openai.com/v1",
      },
    };

    await POST(
      makeRequest({
        request: validRequest,
        settings: byokSettings,
        byokApiKey: "sk-test-key",
      }),
    );

    expect(mockedGenerateWorld).toHaveBeenCalledWith(
      validRequest,
      byokSettings,
      "user-123",
      {
        mode: "byok",
        byokType: "openai",
        byokBaseUrl: "https://api.openai.com/v1",
        byokApiKey: "sk-test-key",
      },
    );
  });

  it("returns 500 when generation fails", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: false,
      error: "AI generation failed",
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("AI generation failed");
  });

  it("includes warnings in response", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-warn",
      warnings: ["Room count below target", "Missing optional NPC"],
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.gameId).toBe("game-warn");
    expect(body.warnings).toEqual([
      "Room count below target",
      "Missing optional NPC",
    ]);
  });

  it("uses session user email as userId when id is missing", async () => {
    const sessionWithoutId = {
      ...mockSession,
      user: { email: "fallback@example.com", name: "Fallback User" },
    };
    mockedAuth.mockResolvedValue(sessionWithoutId as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-email",
    });

    await POST(makeRequest(validBody));

    expect(mockedGenerateWorld).toHaveBeenCalledWith(
      validRequest,
      validSettings,
      "fallback@example.com",
      expect.any(Object),
    );
  });
});
