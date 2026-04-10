import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIProviderConfig, AICompletionOptions } from "./types";

// Mock the SDK before importing the provider
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSendAndWait = vi.fn();
const mockSend = vi.fn().mockResolvedValue("msg-1");
const mockOn = vi.fn();
const mockCreateSession = vi.fn();
const mockListModels = vi.fn();
const mockStop = vi.fn().mockResolvedValue([]);

vi.mock("@github/copilot-sdk", () => {
  const MockCopilotClient = function (this: Record<string, unknown>) {
    this.createSession = mockCreateSession;
    this.listModels = mockListModels;
    this.stop = mockStop;
  } as unknown as { new (): unknown };

  return {
    CopilotClient: MockCopilotClient,
    approveAll: vi.fn(),
  };
});

// Import after mocking
import { CopilotProvider, _resetClientForTesting } from "./copilot-provider";

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
    });

    it("disconnects session even when sendAndWait throws", async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);
      mockSendAndWait.mockRejectedValue(new Error("timeout"));

      await expect(
        provider.generateCompletion("test", options, copilotConfig),
      ).rejects.toThrow("timeout");

      expect(mockDisconnect).toHaveBeenCalledOnce();
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
    });
  });

  describe("streamCompletion", () => {
    it("calls onChunk for each assistant.message event", async () => {
      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      // Capture the event handler registered with session.on
      let capturedHandler: ((event: { type: string; data: { content: string } }) => void) | undefined;

      const session = makeSession({
        on: vi.fn().mockImplementation(
          (eventType: string, handler: (event: { type: string; data: { content: string } }) => void) => {
            if (eventType === "assistant.message") {
              capturedHandler = handler;
            }
            return vi.fn(); // unsubscribe function
          },
        ),
        // sendAndWait fires the captured on("assistant.message") handler before resolving
        sendAndWait: vi.fn().mockImplementation(async () => {
          if (capturedHandler) {
            capturedHandler({ type: "assistant.message", data: { content: "The " } });
            capturedHandler({ type: "assistant.message", data: { content: "dragon " } });
            capturedHandler({ type: "assistant.message", data: { content: "attacks!" } });
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

      expect(mockListModels).toHaveBeenCalledOnce();
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
    });

    it("sets provider to byok type when in BYOK mode", async () => {
      mockListModels.mockResolvedValue([
        { id: "gpt-4.1", name: "GPT-4.1", capabilities: {} },
      ]);

      const models = await provider.listModels(byokConfig);

      expect(models[0].provider).toBe("openai");
    });

    it("surfaces errors from listModels", async () => {
      mockListModels.mockRejectedValue(new Error("rate limit"));

      await expect(provider.listModels(copilotConfig)).rejects.toThrow(
        "rate limit",
      );
    });
  });
});
