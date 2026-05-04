import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AIModelInfo } from "@/providers/types";

// Mock auth and models modules
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  listAvailableModels: vi.fn(),
  getRecommendedModels: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { listAvailableModels, getRecommendedModels } from "@/lib/models";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(auth);
const mockListModels = vi.mocked(listAvailableModels);
const mockGetRecommended = vi.mocked(getRecommendedModels);

const baseUrl = "http://localhost:3000";

function makeRequest(params: Record<string, string> = {}, headers: Record<string, string> = {}): NextRequest {
  const url = new URL("/api/models", baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { headers });
}

function makePostRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL("/api/models", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const sampleModels: AIModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "copilot", recommended: "generation" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "copilot", recommended: "gameplay" },
];

const sampleRecommended = {
  generation: sampleModels[0],
  gameplay: sampleModels[1],
};

describe("GET /api/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    const response = await GET(makeRequest({ provider: "copilot" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when provider param is missing", async () => {
    mockAuth.mockResolvedValue({ accessToken: "tok" } as never);

    const response = await GET(makeRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/provider/i);
  });

  it("returns 400 when provider param is invalid", async () => {
    mockAuth.mockResolvedValue({ accessToken: "tok" } as never);

    const response = await GET(makeRequest({ provider: "invalid" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/provider/i);
  });

  it("returns models for copilot mode", async () => {
    mockAuth.mockResolvedValue({ accessToken: "gho_abc" } as never);
    mockListModels.mockResolvedValue({ models: sampleModels });
    mockGetRecommended.mockReturnValue(sampleRecommended);

    const response = await GET(makeRequest({ provider: "copilot" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.models).toHaveLength(2);
    expect(body.recommended.generation.id).toBe("gpt-4o");
    expect(body.recommended.gameplay.id).toBe("gpt-4o-mini");
  });

  it("rejects BYOK model discovery through GET", async () => {
    mockAuth.mockResolvedValue({ accessToken: "tok" } as never);

    const response = await GET(makeRequest({ provider: "byok", byokType: "openai" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/post/i);
    expect(mockListModels).not.toHaveBeenCalled();
  });

  it("returns models for BYOK mode through POST without GitHub auth", async () => {
    const byokModels: AIModelInfo[] = [
      { id: "openrouter/free", name: "OpenRouter Free Router", provider: "openrouter", recommended: "gameplay" },
    ];
    const byokRecommended = { generation: null, gameplay: byokModels[0] };

    mockAuth.mockResolvedValue(null as never);
    mockListModels.mockResolvedValue({ models: byokModels });
    mockGetRecommended.mockReturnValue(byokRecommended);

    const response = await POST(makePostRequest({
      provider: "byok",
      byokProviderId: "openrouter",
      byokType: "openai",
      byokBaseUrl: "https://openrouter.ai/api/v1",
    }, { "x-byok-api-key": "sk-test" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.models).toHaveLength(1);
    expect(mockListModels).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "byok",
        byokProviderId: "openrouter",
        byokType: "openai",
        byokBaseUrl: "https://openrouter.ai/api/v1",
        byokApiKey: "sk-test",
      }),
    );
  });

  it("passes GitHub token from session for copilot mode", async () => {
    mockAuth.mockResolvedValue({ accessToken: "gho_my_token" } as never);
    mockListModels.mockResolvedValue({ models: sampleModels });
    mockGetRecommended.mockReturnValue(sampleRecommended);

    await GET(makeRequest({ provider: "copilot" }));

    expect(mockListModels).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "copilot",
        githubToken: "gho_my_token",
      }),
    );
  });

  it("reads byokApiKey from x-byok-api-key header only", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockListModels.mockResolvedValue({ models: [] });
    mockGetRecommended.mockReturnValue({ generation: null, gameplay: null });

    await POST(
      makePostRequest(
        { provider: "byok", byokProviderId: "openrouter", byokType: "openai" },
        { "x-byok-api-key": "sk-from-header" },
      ),
    );

    expect(mockListModels).toHaveBeenCalledWith(
      expect.objectContaining({
        byokApiKey: "sk-from-header",
      }),
    );
  });

  it("does not accept BYOK API keys in the request body", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockListModels.mockResolvedValue({ models: [] });
    mockGetRecommended.mockReturnValue({ generation: null, gameplay: null });

    await POST(
      makePostRequest(
        {
          provider: "byok",
          byokProviderId: "openrouter",
          byokType: "openai",
          byokApiKey: "sk-from-body",
        },
        { "x-byok-api-key": "sk-from-header" },
      ),
    );

    expect(mockListModels).toHaveBeenCalledWith(
      expect.objectContaining({
        byokApiKey: "sk-from-header",
      }),
    );
  });

  it("returns 500 on internal error", async () => {
    mockAuth.mockResolvedValue({ accessToken: "tok" } as never);
    mockListModels.mockRejectedValue(new Error("Something broke"));

    const response = await GET(makeRequest({ provider: "copilot" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("includes recommended models in response", async () => {
    mockAuth.mockResolvedValue({ accessToken: "tok" } as never);
    mockListModels.mockResolvedValue({ models: sampleModels });
    mockGetRecommended.mockReturnValue(sampleRecommended);

    const response = await GET(makeRequest({ provider: "copilot" }));

    const body = await response.json();
    expect(body.recommended).toBeDefined();
    expect(body.recommended.generation).toEqual(sampleModels[0]);
    expect(body.recommended.gameplay).toEqual(sampleModels[1]);
    expect(mockGetRecommended).toHaveBeenCalledWith(sampleModels);
  });
});
