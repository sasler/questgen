import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  toGameSettings,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from "./settings";

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  });
});

describe("settings", () => {
  it("loadSettings returns defaults when nothing stored", () => {
    const result = loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("loadSettings returns stored settings merged with defaults", () => {
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify({
      provider: "byok",
      byokType: "openai",
      byokApiKey: "sk-test",
    });

    const result = loadSettings();
    expect(result.provider).toBe("byok");
    expect(result.byokProviderId).toBe("openrouter");
    expect(result.byokType).toBe("openai");
    expect(result.byokApiKey).toBe("sk-test");
    // Defaults still filled in
    expect(result.generationModel).toBe("gpt-4.1");
    expect(result.gameplayModel).toBe("gpt-4.1");
    expect(result.responseLength).toBe("moderate");
  });

  it("loadSettings returns defaults on corrupt data", () => {
    storage[SETTINGS_STORAGE_KEY] = "NOT VALID JSON{{{";

    const result = loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("saveSettings persists to localStorage", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      provider: "byok" as const,
      byokApiKey: "sk-123",
    };

    saveSettings(settings);

    expect(localStorage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  });

  it("DEFAULT_SETTINGS has correct default model values", () => {
    expect(DEFAULT_SETTINGS.generationModel).toBe("gpt-4.1");
    expect(DEFAULT_SETTINGS.gameplayModel).toBe("gpt-4.1");
    expect(DEFAULT_SETTINGS.provider).toBe("copilot");
    expect(DEFAULT_SETTINGS.byokProviderId).toBe("openrouter");
    expect(DEFAULT_SETTINGS.byokType).toBe("openai");
    expect(DEFAULT_SETTINGS.byokBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(DEFAULT_SETTINGS.responseLength).toBe("moderate");
  });

  it("toGameSettings transforms flat BYOK fields to nested byokConfig", () => {
    const flat = {
      ...DEFAULT_SETTINGS,
      provider: "byok" as const,
      byokProviderId: "openrouter" as const,
      byokType: "openai" as const,
      byokBaseUrl: "https://api.openai.com/v1",
      byokApiKey: "sk-test",
    };
    const result = toGameSettings(flat);
    expect(result.byokConfig).toEqual({
      providerId: "openrouter",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(result.provider).toBe("byok");
    // API key should NOT be in the game settings object
    expect(result).not.toHaveProperty("byokApiKey");
  });

  it("toGameSettings omits byokConfig for copilot provider", () => {
    const result = toGameSettings(DEFAULT_SETTINGS);
    expect(result.byokConfig).toBeUndefined();
    expect(result.provider).toBe("copilot");
  });

  it("migrates legacy BYOK settings to the matching provider preset", () => {
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify({
      provider: "byok",
      byokType: "openai",
      byokBaseUrl: "https://api.groq.com/openai/v1",
      byokApiKey: "gsk-test",
    });

    const result = loadSettings();

    expect(result.byokProviderId).toBe("groq");
    expect(result.byokType).toBe("openai");
    expect(result.byokBaseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("migrates legacy BYOK settings with unknown base URLs to custom OpenAI-compatible", () => {
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify({
      provider: "byok",
      byokType: "openai",
      byokBaseUrl: "https://llm.example.com/v1",
      byokApiKey: "custom-key",
    });

    const result = loadSettings();

    expect(result.byokProviderId).toBe("custom-openai");
    expect(result.byokType).toBe("openai");
    expect(result.byokBaseUrl).toBe("https://llm.example.com/v1");
  });

  it("clears stale preset model IDs when migrating unknown legacy BYOK base URLs without a preset id", () => {
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify({
      provider: "byok",
      byokType: "openai",
      byokBaseUrl: "https://llm.example.com/v1",
      byokApiKey: "custom-key",
      generationModel: "openrouter/free",
      gameplayModel: "openrouter/free",
    });

    const result = loadSettings();

    expect(result.byokProviderId).toBe("custom-openai");
    expect(result.generationModel).toBe("");
    expect(result.gameplayModel).toBe("");
  });

  it("migrates unknown legacy BYOK base URLs even when Copilot was selected", () => {
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify({
      provider: "copilot",
      byokType: "openai",
      byokBaseUrl: "https://llm.example.com/v1",
      byokApiKey: "custom-key",
    });

    const result = loadSettings();

    expect(result.provider).toBe("copilot");
    expect(result.byokProviderId).toBe("custom-openai");
    expect(result.byokType).toBe("openai");
    expect(result.byokBaseUrl).toBe("https://llm.example.com/v1");
  });

  it("migrates unknown legacy BYOK base URLs even when a stale preset id was saved", () => {
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify({
      provider: "byok",
      byokProviderId: "openrouter",
      byokType: "openai",
      byokBaseUrl: "https://llm.example.com/v1",
      byokApiKey: "custom-key",
      generationModel: "openrouter/free",
      gameplayModel: "openrouter/free",
    });

    const result = loadSettings();

    expect(result.byokProviderId).toBe("custom-openai");
    expect(result.byokType).toBe("openai");
    expect(result.byokBaseUrl).toBe("https://llm.example.com/v1");
    expect(result.generationModel).toBe("");
    expect(result.gameplayModel).toBe("");
  });
});
