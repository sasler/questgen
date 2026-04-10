import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { CopilotSession, AssistantMessageEvent } from "@github/copilot-sdk";
import type {
  IAIProvider,
  AIProviderConfig,
  AICompletionOptions,
  AICompletionResult,
  AIModelInfo,
} from "./types";

let clientInstance: CopilotClient | null = null;

function getClient(config: AIProviderConfig): CopilotClient {
  if (!clientInstance) {
    const options: ConstructorParameters<typeof CopilotClient>[0] = {
      autoStart: true,
    };

    if (config.mode === "copilot" && config.githubToken) {
      options.githubToken = config.githubToken;
      options.useLoggedInUser = false;
    }

    clientInstance = new CopilotClient(options);
  }
  return clientInstance;
}

/** @internal Reset singleton — exposed for testing only. */
export function _resetClientForTesting(): void {
  clientInstance = null;
}

function buildSessionConfig(
  options: AICompletionOptions,
  config: AIProviderConfig,
) {
  const sessionConfig: Parameters<CopilotClient["createSession"]>[0] = {
    model: options.model,
    onPermissionRequest: approveAll,
    systemMessage: { content: options.systemMessage },
  };

  if (config.mode === "byok" && config.byokBaseUrl) {
    sessionConfig.provider = {
      type: config.byokType ?? "openai",
      baseUrl: config.byokBaseUrl,
      apiKey: config.byokApiKey,
    };
  }

  return sessionConfig;
}

export class CopilotProvider implements IAIProvider {
  async generateCompletion(
    prompt: string,
    options: AICompletionOptions,
    config: AIProviderConfig,
  ): Promise<AICompletionResult> {
    const client = getClient(config);
    const session = await client.createSession(buildSessionConfig(options, config));

    try {
      const response = await session.sendAndWait({ prompt });

      if (!response) {
        throw new Error("No response received from the AI model");
      }

      return {
        content: response.data.content,
        model: options.model,
      };
    } finally {
      await session.disconnect();
    }
  }

  async streamCompletion(
    prompt: string,
    options: AICompletionOptions,
    config: AIProviderConfig,
    onChunk: (chunk: string) => void,
  ): Promise<AICompletionResult> {
    const client = getClient(config);
    const session = await client.createSession(buildSessionConfig(options, config));

    try {
      session.on("assistant.message", (event: AssistantMessageEvent) => {
        onChunk(event.data.content);
      });

      const response = await session.sendAndWait({ prompt });

      if (!response) {
        throw new Error("No response received from the AI model");
      }

      return {
        content: response.data.content,
        model: options.model,
      };
    } finally {
      await session.disconnect();
    }
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    const client = getClient(config);
    const models = await client.listModels();

    const providerName =
      config.mode === "byok" && config.byokType
        ? config.byokType
        : "copilot";

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: providerName,
    }));
  }
}
