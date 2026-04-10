export type {
  IAIProvider,
  AIProviderConfig,
  AICompletionOptions,
  AICompletionResult,
  AIModelInfo,
} from "./types";

export { CopilotProvider } from "./copilot-provider";

import { CopilotProvider } from "./copilot-provider";
import type { IAIProvider } from "./types";

let providerInstance: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (!providerInstance) {
    providerInstance = new CopilotProvider();
  }
  return providerInstance;
}
