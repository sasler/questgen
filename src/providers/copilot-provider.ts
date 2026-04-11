import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { AssistantMessageEvent } from "@github/copilot-sdk";
import type {
  IAIProvider,
  AIProviderConfig,
  AICompletionOptions,
  AICompletionResult,
  AIModelInfo,
} from "./types";

/**
 * Pool of active CLI clients keyed by config.
 *
 * Storing a Promise (rather than a resolved client) means concurrent callers
 * for the same key share a single `start()` invocation — only one CLI process
 * is ever spawned per config identity. Without this guard, concurrent requests
 * would each spawn their own process tree (launcher + app.js), leading to
 * runaway process accumulation and OOM on Windows where `TerminateProcess()`
 * kills only the launcher, not its child.
 */
const clientPool = new Map<string, Promise<CopilotClient>>();
const appRequire = createRequire(join(process.cwd(), "package.json"));
let cachedCliPath: string | null = null;

function getPlatformCliPackageName(): string {
  return `@github/copilot-${process.platform}-${process.arch}`;
}

function getConfigKey(config: AIProviderConfig): string {
  if (config.mode === "copilot") {
    return `copilot:${config.githubToken ?? ""}`;
  }
  return `byok:${config.byokType ?? ""}:${config.byokBaseUrl ?? ""}:${config.byokApiKey ?? ""}`;
}

function resolveCopilotCliPath(): string {
  const configuredPath = process.env.COPILOT_CLI_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  if (cachedCliPath) {
    return cachedCliPath;
  }

  const candidates = new Set<string>();

  const platformPackage = getPlatformCliPackageName();
  const executableName = process.platform === "win32" ? "copilot.exe" : "copilot";
  candidates.add(
    join(process.cwd(), "node_modules", "@github", platformPackage.replace("@github/", ""), executableName),
  );

  try {
    const sdkEntry = appRequire.resolve("@github/copilot/sdk");
    candidates.add(join(dirname(dirname(sdkEntry)), "index.js"));
  } catch {}

  candidates.add(join(process.cwd(), "node_modules", "@github", "copilot", "index.js"));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedCliPath = realpathSync(candidate);
      return cachedCliPath;
    }
  }

  throw new Error(
    "Could not resolve the @github/copilot CLI path. Ensure @github/copilot is installed, or set COPILOT_CLI_PATH.",
  );
}

function buildCopilotCliEnv(): Record<string, string | undefined> {
  const baseTempDir = join(tmpdir(), "questgen-copilot");
  const homeDir = join(baseTempDir, "home");
  const cacheDir = join(baseTempDir, "cache");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  return {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    TMPDIR: tmpdir(),
    COPILOT_HOME: homeDir,
    COPILOT_CACHE_HOME: cacheDir,
    XDG_CACHE_HOME: cacheDir,
  };
}

function createClient(config: AIProviderConfig): CopilotClient {
  const options: ConstructorParameters<typeof CopilotClient>[0] = {
    autoStart: false,
    cliPath: resolveCopilotCliPath(),
    env: buildCopilotCliEnv(),
  };

  if (config.mode === "copilot" && config.githubToken) {
    options.githubToken = config.githubToken;
    options.useLoggedInUser = false;
  }

  return new CopilotClient(options);
}

function getOrCreateClient(config: AIProviderConfig): Promise<CopilotClient> {
  const key = getConfigKey(config);
  const cached = clientPool.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const client = createClient(config);
    await client.start();
    return client;
  })().catch((err) => {
    if (clientPool.get(key) === promise) clientPool.delete(key);
    throw err;
  });

  clientPool.set(key, promise);
  return promise;
}

/** @internal Reset client pool — exposed for testing only. */
export function _resetClientForTesting(): void {
  clientPool.clear();
  cachedCliPath = null;
}

async function withClient<T>(
  config: AIProviderConfig,
  operation: (client: CopilotClient) => Promise<T>,
): Promise<T> {
  const key = getConfigKey(config);
  const poolEntry = getOrCreateClient(config);
  // If start() failed, pool entry is already cleaned up; error propagates here.
  const client = await poolEntry;

  try {
    return await operation(client);
  } catch (error) {
    // Evict and best-effort stop the client on any operation error so the next
    // caller gets a fresh process. Only evict if this entry is still current
    // (a concurrent recovery may have already replaced it).
    if (clientPool.get(key) === poolEntry) {
      clientPool.delete(key);
      client.stop().catch(() => {});
    }
    throw error;
  }
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
    return withClient(config, async (client) => {
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
    });
  }

  async streamCompletion(
    prompt: string,
    options: AICompletionOptions,
    config: AIProviderConfig,
    onChunk: (chunk: string) => void,
  ): Promise<AICompletionResult> {
    return withClient(config, async (client) => {
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
    });
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    return withClient(config, async (client) => {
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
    });
  }
}
