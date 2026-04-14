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

async function readSSEEvents(
  res: Response,
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const text = await res.text();
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  const blocks = text.split("\n\n").filter((b) => b.trim());
  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) eventName = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
    }
    if (eventName && dataStr) {
      events.push({
        event: eventName,
        data: JSON.parse(dataStr) as Record<string, unknown>,
      });
    }
  }
  return events;
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
    mockedAuth.mockResolvedValue(null as never);

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

  it("returns SSE stream with complete event on success", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-456",
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSSEEvents(res);
    const completeEvent = events.find((e) => e.event === "complete");
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.gameId).toBe("game-456");
  });

  it("passes correct aiConfig for copilot mode", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-789",
    });

    const res = await POST(makeRequest(validBody));
    await res.text(); // consume stream to ensure generation completes

    expect(mockedGenerateWorld).toHaveBeenCalledWith(
      validRequest,
      validSettings,
      "user-123",
      {
        mode: "copilot",
        githubToken: "gh-token-abc",
      },
      undefined,
      undefined,
      expect.any(Function),
    );
  });

  it("returns 401 when copilot mode is selected without a GitHub access token", async () => {
    mockedAuth.mockResolvedValue({
      ...mockSession,
      accessToken: undefined,
    } as never);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/reconnect github copilot/i);
    expect(mockedGenerateWorld).not.toHaveBeenCalled();
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

    const res = await POST(
      makeRequest({
        request: validRequest,
        settings: byokSettings,
        byokApiKey: "sk-test-key",
      }),
    );
    await res.text(); // consume stream to ensure generation completes

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
      undefined,
      undefined,
      expect.any(Function),
    );
  });

  it("streams SSE error event when generation fails", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: false,
      error: "AI generation failed",
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSSEEvents(res);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data.message).toBe("AI generation failed");
  });

  it("streams SSE error event when generateWorld throws unexpectedly", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockRejectedValue(new Error("Copilot timeout"));

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSSEEvents(res);
    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data.message as string).toContain("Copilot timeout");
  });

  it("includes warnings in SSE complete event", async () => {
    mockedAuth.mockResolvedValue(mockSession as never);
    mockedGenerateWorld.mockResolvedValue({
      success: true,
      gameId: "game-warn",
      warnings: ["Room count below target", "Missing optional NPC"],
    });

    const res = await POST(makeRequest(validBody));
    const events = await readSSEEvents(res);
    const completeEvent = events.find((e) => e.event === "complete");
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.gameId).toBe("game-warn");
    expect(completeEvent?.data.warnings).toEqual([
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

    const res = await POST(makeRequest(validBody));
    await res.text();

    expect(mockedGenerateWorld).toHaveBeenCalledWith(
      validRequest,
      validSettings,
      "fallback@example.com",
      expect.any(Object),
      undefined,
      undefined,
      expect.any(Function),
    );
  });
});
