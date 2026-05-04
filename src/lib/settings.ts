import {
  DEFAULT_BYOK_PROVIDER_ID,
  findByokProvider,
  findByokProviderByBaseUrl,
  resolveByokProviderDefaults,
  type ByokProviderId,
} from "./byok-providers";

export const SETTINGS_STORAGE_KEY = "questgen-settings";

export interface UserSettings {
  provider: "copilot" | "byok";
  byokProviderId?: ByokProviderId;
  byokType?: "openai" | "azure" | "anthropic";
  byokBaseUrl?: string;
  byokApiKey?: string;
  generationModel: string;
  gameplayModel: string;
  responseLength: "brief" | "moderate" | "detailed";
}

export const DEFAULT_SETTINGS: UserSettings = {
  provider: "copilot",
  byokProviderId: DEFAULT_BYOK_PROVIDER_ID,
  byokType: "openai",
  byokBaseUrl: "https://openrouter.ai/api/v1",
  generationModel: "gpt-4.1",
  gameplayModel: "gpt-4.1",
  responseLength: "moderate",
};

function normalizeSettings(raw: Partial<UserSettings>): UserSettings {
  const merged: UserSettings = { ...DEFAULT_SETTINGS, ...raw };
  const baseUrlProvider = raw.byokBaseUrl ? findByokProviderByBaseUrl(raw.byokBaseUrl) : undefined;
  const customBaseUrl = Boolean(raw.byokBaseUrl && !baseUrlProvider);
  const selectedProvider =
    (customBaseUrl ? findByokProvider("custom-openai") : undefined) ??
    baseUrlProvider ??
    (raw.byokProviderId ? findByokProvider(raw.byokProviderId) : undefined) ??
    findByokProvider(customBaseUrl ? "custom-openai" : merged.byokProviderId);

  if (selectedProvider) {
    const hadStalePresetForCustomBaseUrl = customBaseUrl && raw.byokProviderId !== "custom-openai";

    return {
      ...merged,
      byokProviderId: selectedProvider.id,
      byokType: merged.byokType ?? selectedProvider.type,
      byokBaseUrl: merged.byokBaseUrl || selectedProvider.baseUrl,
      generationModel: hadStalePresetForCustomBaseUrl ? "" : merged.generationModel,
      gameplayModel: hadStalePresetForCustomBaseUrl ? "" : merged.gameplayModel,
    };
  }

  return resolveByokProviderDefaults(merged);
}

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw) as Partial<UserSettings>);
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
      providerId: settings.byokProviderId,
      type: settings.byokType,
      baseUrl: settings.byokBaseUrl,
    };
  }
  return base;
}
