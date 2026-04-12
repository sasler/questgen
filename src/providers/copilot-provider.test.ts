import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AIProviderConfig, AICompletionOptions } from "./types";

// Mock the SDK before importing the provider
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSendAndWait = vi.fn();
const mockSend = vi.fn().mockResolvedValue("msg-1");
const mockOn = vi.fn();
const mockCreateSession = vi.fn();
const mockListModels = vi.fn();
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue([]);

// Track all constructed client instances and their constructor args
const constructedClients: Array<{ instance: Record<string, unknown>; options: unknown }> = [];

vi.mock("@github/copilot-sdk", () => {
  const MockCopilotClient = function (this: Record<string, unknown>, opts?: unknown) {
    this.start = mockStart;
    this.createSession = mockCreateSession;
    this.listModels = mockListModels;
    this.stop = mockStop;
    constructedClients.push({ instance: this, options: opts });
  } as unknown as { new (opts?: unknown): unknown };

  return {
    CopilotClient: MockCopilotClient,
    approveAll: vi.fn(),
  };
});

// Import after mocking
import { CopilotProvider, _resetClientForTesting } from "./copilot-provider";

function getExpectedCliPackageFragment(): string {
  return `@github/copilot-${process.platform}-${process.arch}`;
}

function getExpectedCliPackagePattern(): RegExp {
  const fragment = getExpectedCliPackageFragment().replace("/", "[\\\\/]");
  return new RegExp(`${fragment}[\\\\/]`);
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    sendAndWait: mockSendAndWait,
    send: mockSend,
    on: mockOn,
    disconnect: mockDisconnect,
    ...overrides,
  };
}

describe("CopilotProvider", () => {
  let provider: CopilotProvider;

  const copilotConfig: AIProviderConfig = {
    mode: "copilot",
    githubToken: "gh-token-123",
  };

  const byokConfig: AIProviderConfig = {
    mode: "byok",
    byokType: "openai",
    byokBaseUrl: "https://api.openai.com/v1",
    byokApiKey: "sk-test-key",
  };

  const options: AICompletionOptions = {
    model: "gpt-5",
    systemMessage: "You are a game narrator.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetClientForTesting();
    constructedClients.length = 0;
    provider = new CopilotProvider();
  });

  describe("generateCompletion", () => {
    it("creates a session with correct config and returns content", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "The dragon breathes fire." },
      });

      const result = await provider.generateCompletion(
        "Describe the dragon",
        options,
        copilotConfig,
      );

      expect(result.content).toBe("The dragon breathes fire.");
      expect(result.model).toBe("gpt-5");
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-5",
          systemMessage: expect.objectContaining({
            content: "You are a game narrator.",
          }),
        }),
      );
    });

    it("passes githubToken for Copilot auth mode", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "response" },
      });

      await provider.generateCompletion("test", options, copilotConfig);

      // Copilot mode should NOT pass a provider config
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.not.objectContaining({ provider: expect.anything() }),
      );
    });

    it("passes an explicit Copilot CLI path to the SDK client", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "response" },
      });

      await provider.generateCompletion("test", options, copilotConfig);

      expect(constructedClients[0]?.options).toEqual(
        expect.objectContaining({
          autoStart: false,
          cliPath: expect.stringMatching(getExpectedCliPackagePattern()),
          githubToken: "gh-token-123",
          useLoggedInUser: false,
        }),
      );
    });

    it("passes an explicit cliPath for Copilot mode", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "response" },
      });

      await provider.generateCompletion("test", options, copilotConfig);

      expect(constructedClients[0]?.options).toEqual(
        expect.objectContaining({
          cliPath: expect.stringContaining("@github"),
          githubToken: "gh-token-123",
          useLoggedInUser: false,
        }),
      );
    });

    it("passes temp-backed home and cache directories to the Copilot CLI environment", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "response" },
      });

      await provider.generateCompletion("test", options, copilotConfig);

      expect(constructedClients[0]?.options).toEqual(
        expect.objectContaining({
          env: expect.objectContaining({
            HOME: expect.stringContaining(tmpdir()),
            USERPROFILE: expect.stringContaining(tmpdir()),
            COPILOT_HOME: expect.stringContaining(tmpdir()),
            COPILOT_CACHE_HOME: expect.stringContaining(tmpdir()),
            XDG_CACHE_HOME: expect.stringContaining(tmpdir()),
          }),
        }),
      );

      const env = (constructedClients[0]?.options as { env?: Record<string, string> })?.env;
      expect(env?.HOME ? existsSync(env.HOME) : false).toBe(true);
      expect(env?.COPILOT_CACHE_HOME ? existsSync(env.COPILOT_CACHE_HOME) : false).toBe(true);
    });

    it("prefers COPILOT_CLI_PATH when explicitly configured", async () => {
      vi.stubEnv("COPILOT_CLI_PATH", "C:\\custom\\copilot");
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "response" },
      });

      await provider.generateCompletion("test", options, copilotConfig);

      expect(constructedClients[0]?.options).toEqual(
        expect.objectContaining({
          cliPath: "C:\\custom\\copilot",
        }),
      );
    });

    it("passes BYOK provider config to createSession", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "byok response" },
      });

      await provider.generateCompletion("test", options, byokConfig);

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: {
            type: "openai",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test-key",
          },
        }),
      );
    });

    it("maps anthropic BYOK type correctly", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      const anthropicConfig: AIProviderConfig = {
        mode: "byok",
        byokType: "anthropic",
        byokBaseUrl: "https://api.anthropic.com/v1",
        byokApiKey: "ant-key",
      };

      await provider.generateCompletion("test", options, anthropicConfig);

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: {
            type: "anthropic",
            baseUrl: "https://api.anthropic.com/v1",
            apiKey: "ant-key",
          },
        }),
      );
    });

    it("maps azure BYOK type correctly", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      const azureConfig: AIProviderConfig = {
        mode: "byok",
        byokType: "azure",
        byokBaseUrl: "https://my-resource.openai.azure.com",
        byokApiKey: "azure-key",
      };

      await provider.generateCompletion("test", options, azureConfig);

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: {
            type: "azure",
            baseUrl: "https://my-resource.openai.azure.com",
            apiKey: "azure-key",
          },
        }),
      );
    });

    it("disconnects session after successful request", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({
        data: { content: "done" },
      });

      await provider.generateCompletion("test", options, copilotConfig);

      expect(mockDisconnect).toHaveBeenCalledOnce();
      // Client stays pooled on success — stop() is not called per operation.
      expect(mockStop).not.toHaveBeenCalled();
    });

    it("disconnects session even when sendAndWait throws", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockRejectedValue(new Error("timeout"));

      await expect(
        provider.generateCompletion("test", options, copilotConfig),
      ).rejects.toThrow("timeout");

      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(mockStop).toHaveBeenCalledOnce();
    });

    it("throws when sendAndWait returns no response", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue(undefined);

      await expect(
        provider.generateCompletion("test", options, copilotConfig),
      ).rejects.toThrow("No response received");
    });

    it("surfaces SDK errors", async () => {
      mockCreateSession.mockRejectedValue(new Error("auth failure"));

      await expect(
        provider.generateCompletion("test", options, copilotConfig),
      ).rejects.toThrow("auth failure");

      // Client is evicted on error; stop is called as best-effort cleanup.
      expect(mockStop).toHaveBeenCalledOnce();
    });

    it("evicts and recreates client on error", async () => {
      // First call: createSession fails → client evicted
      mockCreateSession.mockRejectedValueOnce(new Error("auth failure"));
      await expect(
        provider.generateCompletion("test", options, copilotConfig),
      ).rejects.toThrow("auth failure");

      // Second call: fresh client created, start called again
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });
      await provider.generateCompletion("test", options, copilotConfig);

      expect(constructedClients).toHaveLength(2);
      expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it("starts the client explicitly before creating a session", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await provider.generateCompletion("test", options, copilotConfig);

      expect(mockStart).toHaveBeenCalledBefore(mockCreateSession);
    });
  });

  describe("streamCompletion", () => {
    it("calls onChunk for each assistant.message_delta event", async () => {
      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      // Capture the event handler registered with session.on
      let capturedHandler:
        | ((event: { type: string; data: { deltaContent: string } }) => void)
        | undefined;

      const session = makeSession({
        on: vi.fn().mockImplementation(
          (
            eventType: string,
            handler: (event: { type: string; data: { deltaContent: string } }) => void,
          ) => {
            if (eventType === "assistant.message_delta") {
              capturedHandler = handler;
            }
            return vi.fn(); // unsubscribe function
          },
        ),
        // sendAndWait fires the captured on("assistant.message_delta") handler before resolving
        sendAndWait: vi.fn().mockImplementation(async () => {
          if (capturedHandler) {
            capturedHandler({
              type: "assistant.message_delta",
              data: { deltaContent: "The " },
            });
            capturedHandler({
              type: "assistant.message_delta",
              data: { deltaContent: "dragon " },
            });
            capturedHandler({
              type: "assistant.message_delta",
              data: { deltaContent: "attacks!" },
            });
          }
          return { data: { content: "The dragon attacks!" } };
        }),
      });

      mockCreateSession.mockResolvedValue(session);

      const result = await provider.streamCompletion(
        "What happens next?",
        options,
        copilotConfig,
        onChunk,
      );

      expect(chunks).toEqual(["The ", "dragon ", "attacks!"]);
      expect(result.content).toBe("The dragon attacks!");
      expect(result.model).toBe("gpt-5");
    });

    it("enables streaming on the SDK session config", async () => {
      const session = makeSession({
        on: vi.fn().mockReturnValue(vi.fn()),
        sendAndWait: vi.fn().mockResolvedValue({
          data: { content: "done" },
        }),
      });
      mockCreateSession.mockResolvedValue(session);

      await provider.streamCompletion("test", options, copilotConfig, () => {});

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          streaming: true,
        }),
      );
    });

    it("disconnects session after streaming completes", async () => {
      const session = makeSession({
        on: vi.fn().mockReturnValue(vi.fn()),
        sendAndWait: vi.fn().mockResolvedValue({
          data: { content: "done" },
        }),
      });
      mockCreateSession.mockResolvedValue(session);

      await provider.streamCompletion(
        "test",
        options,
        copilotConfig,
        () => {},
      );

      expect(session.disconnect).toHaveBeenCalledOnce();
      // Client stays pooled on success — stop() is not called per operation.
      expect(mockStop).not.toHaveBeenCalled();
    });

    it("disconnects session even when streaming throws", async () => {
      const session = makeSession({
        on: vi.fn().mockReturnValue(vi.fn()),
        sendAndWait: vi.fn().mockRejectedValue(new Error("stream error")),
      });
      mockCreateSession.mockResolvedValue(session);

      await expect(
        provider.streamCompletion("test", options, copilotConfig, () => {}),
      ).rejects.toThrow("stream error");

      expect(session.disconnect).toHaveBeenCalledOnce();
      expect(mockStop).toHaveBeenCalledOnce();
    });
  });

  describe("listModels", () => {
    it("delegates to client.listModels()", async () => {
      mockListModels.mockResolvedValue([
        { id: "gpt-5", name: "GPT-5", capabilities: {} },
        {
          id: "claude-sonnet-4.5",
          name: "Claude Sonnet 4.5",
          capabilities: {},
        },
      ]);

      const models = await provider.listModels(copilotConfig);

      expect(mockStart).toHaveBeenCalledOnce();
      expect(mockListModels).toHaveBeenCalledOnce();
      // Client stays pooled on success — stop() is not called per operation.
      expect(mockStop).not.toHaveBeenCalled();
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual(
        expect.objectContaining({ id: "gpt-5", name: "GPT-5" }),
      );
      expect(models[1]).toEqual(
        expect.objectContaining({
          id: "claude-sonnet-4.5",
          name: "Claude Sonnet 4.5",
        }),
      );
    });

    it("returns model info with provider field", async () => {
      mockListModels.mockResolvedValue([
        { id: "gpt-5", name: "GPT-5", capabilities: {} },
      ]);

      const models = await provider.listModels(copilotConfig);

      expect(models[0].provider).toBe("copilot");
      // Client stays pooled on success — stop() is not called per operation.
      expect(mockStop).not.toHaveBeenCalled();
    });

    it("sets provider to byok type when in BYOK mode", async () => {
      mockListModels.mockResolvedValue([
        { id: "gpt-4.1", name: "GPT-4.1", capabilities: {} },
      ]);

      const models = await provider.listModels(byokConfig);

      expect(models[0].provider).toBe("openai");
      // Client stays pooled on success — stop() is not called per operation.
      expect(mockStop).not.toHaveBeenCalled();
    });

    it("surfaces errors from listModels", async () => {
      mockListModels.mockRejectedValue(new Error("rate limit"));

      await expect(provider.listModels(copilotConfig)).rejects.toThrow(
        "rate limit",
      );

      expect(mockStop).toHaveBeenCalledOnce();
    });
  });

  describe("client lifecycle", () => {
    it("reuses the same client for the same config", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await provider.generateCompletion("a", options, copilotConfig);
      await provider.generateCompletion("b", options, copilotConfig);

      // One client constructed, started once, reused for both calls.
      expect(constructedClients).toHaveLength(1);
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it("concurrent calls with same config share a single client start", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await Promise.all([
        provider.generateCompletion("a", options, copilotConfig),
        provider.generateCompletion("b", options, copilotConfig),
      ]);

      // Pool entry is set before start() resolves, so both concurrent callers
      // await the same Promise — only one CopilotClient is ever constructed.
      expect(constructedClients).toHaveLength(1);
      expect(mockStart).toHaveBeenCalledOnce();
    });

    it("creates different clients for different github tokens", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      const userA: AIProviderConfig = { mode: "copilot", githubToken: "token-user-A" };
      const userB: AIProviderConfig = { mode: "copilot", githubToken: "token-user-B" };

      await provider.generateCompletion("a", options, userA);
      await provider.generateCompletion("b", options, userB);

      expect(constructedClients).toHaveLength(2);
      expect(constructedClients[0].options).toEqual(
        expect.objectContaining({ githubToken: "token-user-A" }),
      );
      expect(constructedClients[1].options).toEqual(
        expect.objectContaining({ githubToken: "token-user-B" }),
      );
    });

    it("creates different clients for different BYOK configs", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      const byokA: AIProviderConfig = {
        mode: "byok",
        byokType: "openai",
        byokBaseUrl: "https://a.example.com",
        byokApiKey: "key-a",
      };
      const byokB: AIProviderConfig = {
        mode: "byok",
        byokType: "openai",
        byokBaseUrl: "https://b.example.com",
        byokApiKey: "key-b",
      };

      await provider.generateCompletion("a", options, byokA);
      await provider.generateCompletion("b", options, byokB);

      expect(constructedClients).toHaveLength(2);
    });

    it("creates different clients for copilot vs byok mode", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockResolvedValue({ data: { content: "ok" } });

      await provider.generateCompletion("a", options, copilotConfig);
      await provider.generateCompletion("b", options, byokConfig);

      expect(constructedClients).toHaveLength(2);
    });
  });
});
