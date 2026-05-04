import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAvailableModels, getRecommendedModels } from "./models";
import type { AIModelInfo, AIProviderConfig, IAIProvider } from "@/providers/types";

// Mock the providers module so we control getAIProvider
vi.mock("@/providers", () => ({
  getAIProvider: vi.fn(),
}));

import { getAIProvider } from "@/providers";
const mockGetAIProvider = vi.mocked(getAIProvider);

function makeMockProvider(models: AIModelInfo[]): IAIProvider {
  return {
    listModels: vi.fn().mockResolvedValue(models),
    generateCompletion: vi.fn(),
    streamCompletion: vi.fn(),
  };
}

describe("listAvailableModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("delegates to provider.listModels in copilot mode", async () => {
    const copilotModels: AIModelInfo[] = [
      { id: "gpt-4o", name: "GPT-4o", provider: "copilot" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "copilot" },
    ];
    const provider = makeMockProvider(copilotModels);
    mockGetAIProvider.mockReturnValue(provider);

    const config: AIProviderConfig = { mode: "copilot", githubToken: "tok" };
    const result = await listAvailableModels(config);

    expect(provider.listModels).toHaveBeenCalledWith(config);
    expect(result.models.length).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("adds recommended tags to known copilot models", async () => {
    const copilotModels: AIModelInfo[] = [
      { id: "gpt-4o", name: "GPT-4o", provider: "copilot" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "copilot" },
      { id: "some-unknown-model", name: "Unknown", provider: "copilot" },
    ];
    const provider = makeMockProvider(copilotModels);
    mockGetAIProvider.mockReturnValue(provider);

    const config: AIProviderConfig = { mode: "copilot" };
    const result = await listAvailableModels(config);

    const gpt4o = result.models.find((m) => m.id === "gpt-4o");
    const gpt4oMini = result.models.find((m) => m.id === "gpt-4o-mini");
    const unknown = result.models.find((m) => m.id === "some-unknown-model");

    expect(gpt4o?.recommended).toBe("generation");
    expect(gpt4oMini?.recommended).toBe("gameplay");
    expect(unknown?.recommended).toBeUndefined();
  });

  it("loads BYOK models from an OpenAI-compatible /models endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openrouter/free", name: "OpenRouter Free Router" },
          { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "openai",
      byokProviderId: "openrouter",
      byokBaseUrl: "https://openrouter.ai/api/v1",
      byokApiKey: "sk-or-test",
    };
    const result = await listAvailableModels(config);

    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: "Bearer sk-or-test" },
    });
    expect(result.models).toEqual([
      {
        id: "openrouter/free",
        name: "OpenRouter Free Router",
        provider: "openrouter",
        recommended: "gameplay",
      },
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "openrouter",
      },
    ]);
    expect(result.error).toBeUndefined();
  });

  it("loads Gemini BYOK models from the Gemini model listing API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            name: "models/gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/text-embedding-004",
            displayName: "Text Embedding 004",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "openai",
      byokProviderId: "gemini",
      byokBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      byokApiKey: "gemini-key",
    };
    const result = await listAvailableModels(config);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key",
    );
    expect(result.models).toEqual([
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "gemini",
        recommended: "generation",
      },
    ]);
    expect(result.error).toBeUndefined();
  });

  it("falls back to curated BYOK preset models when live discovery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }),
    );

    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "openai",
      byokProviderId: "cerebras",
      byokBaseUrl: "https://api.cerebras.ai/v1",
      byokApiKey: "csk-test",
    };
    const result = await listAvailableModels(config);

    expect(result.models.some((m) => m.id === "gpt-oss-120b")).toBe(true);
    expect(result.error).toMatch(/401/);
  });

  it("rejects model discovery when the selected preset base URL is spoofed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAvailableModels({
      mode: "byok",
      byokType: "openai",
      byokProviderId: "openrouter",
      byokBaseUrl: "http://127.0.0.1:8080",
      byokApiKey: "sk-or-test",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.models.some((model) => model.id === "openrouter/free")).toBe(true);
    expect(result.error).toMatch(/does not match/i);
  });

  it("does not call provider.listModels in byok mode", async () => {
    const provider = makeMockProvider([]);
    mockGetAIProvider.mockReturnValue(provider);

    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "openai",
      byokBaseUrl: "https://api.openai.com",
      byokApiKey: "sk-test",
    };
    await listAvailableModels(config);

    expect(provider.listModels).not.toHaveBeenCalled();
  });

  it("returns empty list with error for unknown BYOK provider", async () => {
    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "openai",
      byokProviderId: "unknown-provider",
    };
    const result = await listAvailableModels(config);

    expect(result.models).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/unknown/i);
  });

  it("handles provider.listModels failure gracefully", async () => {
    const provider = makeMockProvider([]);
    (provider.listModels as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );
    mockGetAIProvider.mockReturnValue(provider);

    const config: AIProviderConfig = { mode: "copilot" };
    const result = await listAvailableModels(config);

    expect(result.models).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/Network error/);
  });
});

describe("getRecommendedModels", () => {
  it("returns first model tagged for each purpose", () => {
    const models: AIModelInfo[] = [
      { id: "a", name: "A", provider: "x", recommended: "generation" },
      { id: "b", name: "B", provider: "x", recommended: "gameplay" },
      { id: "c", name: "C", provider: "x", recommended: "generation" },
    ];
    const result = getRecommendedModels(models);

    expect(result.generation?.id).toBe("a");
    expect(result.gameplay?.id).toBe("b");
  });

  it("falls back to first model when no recommendations exist", () => {
    const models: AIModelInfo[] = [
      { id: "a", name: "A", provider: "x" },
      { id: "b", name: "B", provider: "x" },
    ];
    const result = getRecommendedModels(models);

    expect(result.generation?.id).toBe("a");
    expect(result.gameplay?.id).toBe("a");
  });

  it("returns null for both when models array is empty", () => {
    const result = getRecommendedModels([]);

    expect(result.generation).toBeNull();
    expect(result.gameplay).toBeNull();
  });

  it("falls back for missing purpose only", () => {
    const models: AIModelInfo[] = [
      { id: "a", name: "A", provider: "x", recommended: "generation" },
      { id: "b", name: "B", provider: "x" },
    ];
    const result = getRecommendedModels(models);

    expect(result.generation?.id).toBe("a");
    // No gameplay-tagged model, falls back to first available
    expect(result.gameplay?.id).toBe("a");
  });

  it("prefers gpt-4.1 for both purposes when no tags exist", () => {
    const models: AIModelInfo[] = [
      { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
    ];
    const result = getRecommendedModels(models);

    expect(result.generation?.id).toBe("gpt-4.1");
    expect(result.gameplay?.id).toBe("gpt-4.1");
  });

  it("prefers gpt-4.1 over first model for missing purpose", () => {
    const models: AIModelInfo[] = [
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", recommended: "generation" },
      { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
    ];
    const result = getRecommendedModels(models);

    expect(result.generation?.id).toBe("gpt-4o");
    expect(result.gameplay?.id).toBe("gpt-4.1");
  });
});
