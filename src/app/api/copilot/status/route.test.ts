import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth and providers modules before importing the route
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/providers", () => ({
  getAIProvider: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { getAIProvider } from "@/providers";
import { GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockGetAIProvider = vi.mocked(getAIProvider);

describe("GET /api/copilot/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns github.connected=false when no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(body.github.connected).toBe(false);
    expect(body.copilot.available).toBe(false);
  });

  it("returns github.connected=true with username when session exists", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "testuser", email: "test@example.com", image: "https://avatar.url" },
      accessToken: "gho_abc123",
    } as never);

    const mockProvider = {
      listModels: vi.fn().mockResolvedValue([
        { id: "gpt-4o", name: "GPT-4o", provider: "copilot" },
      ]),
    };
    mockGetAIProvider.mockReturnValue(mockProvider as never);

    const response = await GET();
    const body = await response.json();

    expect(body.github.connected).toBe(true);
    expect(body.github.username).toBe("testuser");
    expect(body.github.avatar).toBe("https://avatar.url");
    expect(body.copilot.available).toBe(true);
  });

  it("returns copilot.available=false when no access token", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "testuser" },
      // No accessToken
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(body.github.connected).toBe(true);
    expect(body.copilot.available).toBe(false);
  });

  it("handles Copilot SDK errors gracefully", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "testuser" },
      accessToken: "gho_abc123",
    } as never);

    const mockProvider = {
      listModels: vi.fn().mockRejectedValue(new Error("Copilot not enabled")),
    };
    mockGetAIProvider.mockReturnValue(mockProvider as never);

    const response = await GET();
    const body = await response.json();

    expect(body.github.connected).toBe(true);
    expect(body.copilot.available).toBe(false);
    expect(body.copilot.error).toBe("Copilot not enabled");
  });
});
