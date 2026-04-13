export type {
  IAIProvider,
  AIProviderConfig,
  AICompletionOptions,
  AICompletionResult,
  AIModelInfo,
} from "./types";

export { CopilotProvider } from "./copilot-provider";
export { StubProvider } from "./stub-provider";

import { CopilotProvider } from "./copilot-provider";
import { StubProvider } from "./stub-provider";
import type { IAIProvider } from "./types";

let providerInstance: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (!providerInstance) {
    providerInstance =
      process.env.QUESTGEN_STUB_AI === "1"
        ? new StubProvider()
        : new CopilotProvider();
  }
  return providerInstance;
}
