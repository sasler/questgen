export const SETTINGS_STORAGE_KEY = "questgen-settings";

export interface UserSettings {
  provider: "copilot" | "byok";
  byokType?: "openai" | "azure" | "anthropic";
  byokBaseUrl?: string;
  byokApiKey?: string;
  generationModel: string;
  gameplayModel: string;
  responseLength: "brief" | "moderate" | "detailed";
}

export const DEFAULT_SETTINGS: UserSettings = {
  provider: "copilot",
  generationModel: "gpt-4.1",
  gameplayModel: "gpt-4.1",
  responseLength: "moderate",
};

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt data */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: UserSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Transform flat browser settings into the nested shape the API routes expect
 * (GameSettings from src/types/game.ts uses byokConfig: { type, baseUrl }).
 */
export function toGameSettings(settings: UserSettings): Record<string, unknown> {
  const base: Record<string, unknown> = {
    provider: settings.provider,
    generationModel: settings.generationModel,
    gameplayModel: settings.gameplayModel,
    responseLength: settings.responseLength,
  };
  if (settings.provider === "byok" && settings.byokType) {
    base.byokConfig = {
      type: settings.byokType,
      baseUrl: settings.byokBaseUrl,
    };
  }
  return base;
}
