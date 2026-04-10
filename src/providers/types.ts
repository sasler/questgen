export interface AIProviderConfig {
  mode: "copilot" | "byok";
  // For copilot mode:
  githubToken?: string;
  // For BYOK mode:
  byokType?: "openai" | "azure" | "anthropic";
  byokBaseUrl?: string;
  byokApiKey?: string;
}

export interface AICompletionOptions {
  model: string;
  systemMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AICompletionResult {
  content: string;
  model: string;
  finishReason?: string;
}

export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  recommended?: "generation" | "gameplay";
}

export interface IAIProvider {
  generateCompletion(
    prompt: string,
    options: AICompletionOptions,
    config: AIProviderConfig,
  ): Promise<AICompletionResult>;

  streamCompletion(
    prompt: string,
    options: AICompletionOptions,
    config: AIProviderConfig,
    onChunk: (chunk: string) => void,
  ): Promise<AICompletionResult>;

  listModels(config: AIProviderConfig): Promise<AIModelInfo[]>;
}
