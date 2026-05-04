import type { AIProviderConfig } from "@/providers/types";

export type ByokProviderId =
  | "openrouter"
  | "gemini"
  | "groq"
  | "cerebras"
  | "mistral"
  | "custom-openai";

export interface ByokProviderPreset {
  id: ByokProviderId;
  label: string;
  description: string;
  type: NonNullable<AIProviderConfig["byokType"]>;
  baseUrl: string;
  keyUrl: string;
  keyLinkLabel: string;
  requiresApiKey: boolean;
  modelList: "openai-compatible" | "gemini";
  fallbackModels: Array<{
    id: string;
    name: string;
    recommended?: "generation" | "gameplay";
  }>;
}

export const BYOK_PROVIDER_CATALOG: ByokProviderPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Free model router and a broad OpenAI-compatible model catalog.",
    type: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    keyLinkLabel: "Get OpenRouter key",
    requiresApiKey: true,
    modelList: "openai-compatible",
    fallbackModels: [
      { id: "openrouter/free", name: "OpenRouter Free Router", recommended: "gameplay" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B Free" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Google AI Studio keys with a generous no-cost tier in eligible regions.",
    type: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/apikey",
    keyLinkLabel: "Get Gemini key",
    requiresApiKey: true,
    modelList: "gemini",
    fallbackModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", recommended: "generation" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", recommended: "gameplay" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    description: "Fast OpenAI-compatible inference with a developer free tier.",
    type: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    keyLinkLabel: "Get Groq key",
    requiresApiKey: true,
    modelList: "openai-compatible",
    fallbackModels: [
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", recommended: "gameplay" },
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", recommended: "generation" },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
    ],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    description: "Fast OpenAI-compatible inference with free API-key access.",
    type: "openai",
    baseUrl: "https://api.cerebras.ai/v1",
    keyUrl: "https://cloud.cerebras.ai",
    keyLinkLabel: "Get Cerebras key",
    requiresApiKey: true,
    modelList: "openai-compatible",
    fallbackModels: [
      { id: "gpt-oss-120b", name: "GPT OSS 120B", recommended: "generation" },
      { id: "llama3.1-8b", name: "Llama 3.1 8B", recommended: "gameplay" },
      { id: "qwen-3-235b-a22b-instruct-2507", name: "Qwen 3 235B A22B Instruct" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    description: "Mistral's API has a free Experiment plan with conservative limits.",
    type: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyLinkLabel: "Get Mistral key",
    requiresApiKey: true,
    modelList: "openai-compatible",
    fallbackModels: [
      { id: "mistral-small-latest", name: "Mistral Small", recommended: "gameplay" },
      { id: "mistral-medium-latest", name: "Mistral Medium", recommended: "generation" },
      { id: "mistral-large-latest", name: "Mistral Large" },
    ],
  },
  {
    id: "custom-openai",
    label: "Custom OpenAI-compatible",
    description: "Use any OpenAI-compatible endpoint such as a self-hosted gateway.",
    type: "openai",
    baseUrl: "",
    keyUrl: "https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md",
    keyLinkLabel: "BYOK docs",
    requiresApiKey: false,
    modelList: "openai-compatible",
    fallbackModels: [],
  },
];

export const DEFAULT_BYOK_PROVIDER_ID: ByokProviderId = "openrouter";

export function findByokProvider(id?: string): ByokProviderPreset | undefined {
  return BYOK_PROVIDER_CATALOG.find((provider) => provider.id === id);
}

export function findByokProviderByBaseUrl(baseUrl?: string): ByokProviderPreset | undefined {
  const normalized = baseUrl?.replace(/\/+$/, "");
  if (!normalized) return undefined;
  return BYOK_PROVIDER_CATALOG.find(
    (provider) => provider.baseUrl.replace(/\/+$/, "") === normalized,
  );
}

export function resolveByokProviderDefaults<T extends {
  byokProviderId?: string;
  byokType?: AIProviderConfig["byokType"];
  byokBaseUrl?: string;
}>(settings: T): T & {
  byokProviderId: ByokProviderId;
  byokType: NonNullable<AIProviderConfig["byokType"]>;
  byokBaseUrl: string;
} {
  const provider =
    findByokProvider(settings.byokProviderId) ??
    findByokProviderByBaseUrl(settings.byokBaseUrl) ??
    findByokProvider(DEFAULT_BYOK_PROVIDER_ID)!;

  return {
    ...settings,
    byokProviderId: provider.id,
    byokType: settings.byokType ?? provider.type,
    byokBaseUrl: settings.byokBaseUrl?.trim() || provider.baseUrl,
  };
}
