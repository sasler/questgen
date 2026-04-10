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

  it("returns correct hardcoded list for BYOK openai", async () => {
    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "openai",
      byokBaseUrl: "https://api.openai.com",
      byokApiKey: "sk-test",
    };
    const result = await listAvailableModels(config);

    expect(result.models.length).toBe(5);
    expect(result.models.every((m) => m.provider === "openai")).toBe(true);
    expect(result.models.find((m) => m.id === "gpt-4.1")).toBeDefined();
    expect(result.models.find((m) => m.id === "gpt-4.1-mini")).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("returns correct hardcoded list for BYOK anthropic", async () => {
    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "anthropic",
      byokBaseUrl: "https://api.anthropic.com",
      byokApiKey: "sk-test",
    };
    const result = await listAvailableModels(config);

    expect(result.models.length).toBe(2);
    expect(result.models.every((m) => m.provider === "anthropic")).toBe(true);
    expect(result.models.find((m) => m.id === "claude-sonnet-4-20250514")).toBeDefined();
    expect(result.models.find((m) => m.id === "claude-haiku-3-5-20241022")).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("returns correct hardcoded list for BYOK azure", async () => {
    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "azure",
      byokBaseUrl: "https://my.azure.endpoint",
      byokApiKey: "key",
    };
    const result = await listAvailableModels(config);

    expect(result.models.length).toBe(2);
    expect(result.models.every((m) => m.provider === "azure")).toBe(true);
    expect(result.error).toBeUndefined();
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

  it("returns empty list with error for unknown BYOK type", async () => {
    const config: AIProviderConfig = {
      mode: "byok",
      byokType: "unknown-provider" as AIProviderConfig["byokType"],
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
});
