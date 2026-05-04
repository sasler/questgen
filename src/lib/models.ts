import type { AIModelInfo, AIProviderConfig } from "@/providers/types";
import { getAIProvider } from "@/providers";
import { findByokProvider } from "./byok-providers";

export interface ModelListResult {
  models: AIModelInfo[];
  error?: string;
}

// Known model IDs → recommended purpose for tagging copilot results
const RECOMMENDED_MAP: Record<string, "generation" | "gameplay"> = {
  "gpt-4o": "generation",
  "gpt-4.1": "generation",
  "claude-sonnet-4-20250514": "generation",
  "gemini-2.5-flash": "generation",
  "gemini-2.5-pro": "generation",
  "openai/gpt-oss-120b": "generation",
  "gpt-oss-120b": "generation",
  "mistral-medium-latest": "generation",
  "gpt-4o-mini": "gameplay",
  "gpt-4.1-mini": "gameplay",
  "gpt-4.1-nano": "gameplay",
  "claude-haiku-3-5-20241022": "gameplay",
  "openrouter/free": "gameplay",
  "gemini-2.5-flash-lite": "gameplay",
  "openai/gpt-oss-20b": "gameplay",
  "llama3.1-8b": "gameplay",
  "mistral-small-latest": "gameplay",
};

function tagRecommended(models: AIModelInfo[]): AIModelInfo[] {
  return models.map((m) => ({
    ...m,
    recommended: m.recommended ?? RECOMMENDED_MAP[m.id],
  }));
}

function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function providerName(config: AIProviderConfig): string {
  return config.byokProviderId ?? config.byokType ?? "byok";
}

function fallbackModels(config: AIProviderConfig): AIModelInfo[] {
  const provider = findByokProvider(config.byokProviderId);
  if (!provider) return [];

  return provider.fallbackModels.map((model) => ({
    ...model,
    provider: provider.id,
  }));
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function fetchOpenAICompatibleModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
  const provider = findByokProvider(config.byokProviderId);
  if (!provider) {
    throw new Error(`Unknown BYOK provider: ${config.byokProviderId ?? "undefined"}`);
  }

  if (provider.id === "custom-openai") {
    throw new Error("Live model discovery is not available for custom BYOK endpoints.");
  }

  if (
    config.byokBaseUrl &&
    normalizeBaseUrl(config.byokBaseUrl) !== normalizeBaseUrl(provider.baseUrl)
  ) {
    throw new Error("BYOK base URL does not match the selected provider preset.");
  }

  const headers: Record<string, string> = {};
  if (config.byokApiKey) {
    headers.Authorization = `Bearer ${config.byokApiKey}`;
  }

  const response = await fetch(modelsUrl(provider.baseUrl), { headers });
  if (!response.ok) {
    const body = await readResponseText(response);
    throw new Error(
      `Model discovery failed with ${response.status}${body ? `: ${body}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string; name?: string; display_name?: string }>;
  };

  return (data.data ?? [])
    .filter((model): model is { id: string; name?: string; display_name?: string } =>
      typeof model.id === "string" && model.id.length > 0,
    )
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.display_name ?? model.id,
      provider: providerName(config),
    }));
}

async function fetchGeminiModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
  if (!config.byokApiKey) {
    throw new Error("Gemini API key is required to load models.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      config.byokApiKey,
    )}`,
  );
  if (!response.ok) {
    const body = await readResponseText(response);
    throw new Error(
      `Model discovery failed with ${response.status}${body ? `: ${body}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (data.models ?? [])
    .filter(
      (model): model is {
        name: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      } =>
        typeof model.name === "string" &&
        (model.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((model) => {
      const id = model.name.replace(/^models\//, "");
      return {
        id,
        name: model.displayName ?? id,
        provider: providerName(config),
      };
    });
}

async function listByokModels(config: AIProviderConfig): Promise<ModelListResult> {
  const provider = findByokProvider(config.byokProviderId);
  if (!provider) {
    return {
      models: [],
      error: `Unknown BYOK provider: ${config.byokProviderId ?? "undefined"}`,
    };
  }

  try {
    const raw =
      provider.modelList === "gemini"
        ? await fetchGeminiModels(config)
        : await fetchOpenAICompatibleModels(config);
    return { models: tagRecommended(raw) };
  } catch (error) {
    const fallback = tagRecommended(fallbackModels(config));
    return {
      models: fallback,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listAvailableModels(
  config: AIProviderConfig,
): Promise<ModelListResult> {
  if (config.mode === "byok") {
    return listByokModels(config);
  }

  // Copilot mode — delegate to provider
  try {
    const provider = getAIProvider();
    const raw = await provider.listModels(config);
    return { models: tagRecommended(raw) };
  } catch (err) {
    return {
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getRecommendedModels(
  models: AIModelInfo[],
): { generation: AIModelInfo | null; gameplay: AIModelInfo | null } {
  // Prefer gpt-4.1 for both if available
  const gpt41 = models.find((m) => m.id === "gpt-4.1");
  const generation = models.find((m) => m.recommended === "generation") ?? gpt41 ?? models[0] ?? null;
  const gameplay = models.find((m) => m.recommended === "gameplay") ?? gpt41 ?? models[0] ?? null;
  return { generation, gameplay };
}
