import type { AIModelInfo, AIProviderConfig } from "@/providers/types";
import { getAIProvider } from "@/providers";

export interface ModelListResult {
  models: AIModelInfo[];
  error?: string;
}

const OPENAI_MODELS: AIModelInfo[] = [
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", recommended: "generation" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", recommended: "gameplay" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai", recommended: "gameplay" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", recommended: "generation" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", recommended: "gameplay" },
];

const ANTHROPIC_MODELS: AIModelInfo[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", recommended: "generation" },
  { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5", provider: "anthropic", recommended: "gameplay" },
];

const AZURE_MODELS: AIModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o (Azure)", provider: "azure", recommended: "generation" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini (Azure)", provider: "azure", recommended: "gameplay" },
];

const BYOK_MODEL_MAP: Record<string, AIModelInfo[]> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  azure: AZURE_MODELS,
};

// Known model IDs → recommended purpose for tagging copilot results
const RECOMMENDED_MAP: Record<string, "generation" | "gameplay"> = {
  "gpt-4o": "generation",
  "gpt-4.1": "generation",
  "claude-sonnet-4-20250514": "generation",
  "gpt-4o-mini": "gameplay",
  "gpt-4.1-mini": "gameplay",
  "gpt-4.1-nano": "gameplay",
  "claude-haiku-3-5-20241022": "gameplay",
};

function tagRecommended(models: AIModelInfo[]): AIModelInfo[] {
  return models.map((m) => ({
    ...m,
    recommended: m.recommended ?? RECOMMENDED_MAP[m.id],
  }));
}

export async function listAvailableModels(
  config: AIProviderConfig,
): Promise<ModelListResult> {
  if (config.mode === "byok") {
    const byokType = config.byokType;
    const models = byokType ? BYOK_MODEL_MAP[byokType] : undefined;
    if (!models) {
      return {
        models: [],
        error: `Unknown BYOK provider type: ${byokType ?? "undefined"}`,
      };
    }
    return { models: [...models] };
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
  const generation = models.find((m) => m.recommended === "generation") ?? models[0] ?? null;
  const gameplay = models.find((m) => m.recommended === "gameplay") ?? models[0] ?? null;
  return { generation, gameplay };
}
