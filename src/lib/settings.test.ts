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
    expect(DEFAULT_SETTINGS.responseLength).toBe("moderate");
  });

  it("toGameSettings transforms flat BYOK fields to nested byokConfig", () => {
    const flat = {
      ...DEFAULT_SETTINGS,
      provider: "byok" as const,
      byokType: "openai" as const,
      byokBaseUrl: "https://api.openai.com/v1",
      byokApiKey: "sk-test",
    };
    const result = toGameSettings(flat);
    expect(result.byokConfig).toEqual({
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
});
