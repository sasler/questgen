import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth and providers modules before importing the route
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  isAuthConfigured: vi.fn(),
}));

vi.mock("@/providers", () => ({
  getAIProvider: vi.fn(),
}));

import { auth, isAuthConfigured } from "@/lib/auth";
import { getAIProvider } from "@/providers";
import { GET } from "./route";

const mockAuth = vi.mocked(auth);
const mockIsAuthConfigured = vi.mocked(isAuthConfigured);
const mockGetAIProvider = vi.mocked(getAIProvider);

describe("GET /api/copilot/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthConfigured.mockReturnValue(true);
  });

  it("returns deployment auth status when GitHub sign-in is not configured", async () => {
    mockIsAuthConfigured.mockReturnValue(false);
    mockAuth.mockResolvedValue(null as never);

    const response = await GET();
    const body = await response.json();

    expect(body.authConfigured).toBe(false);
    expect(body.github.connected).toBe(false);
    expect(body.copilot.available).toBe(false);
    expect(mockGetAIProvider).not.toHaveBeenCalled();
  });

  it("returns github.connected=true with username when session exists", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "testuser", email: "test@example.com", image: "https://avatar.url" },
      accessToken: "gho_abc123",
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(body.github.connected).toBe(true);
    expect(body.github.username).toBe("testuser");
    expect(body.github.avatar).toBe("https://avatar.url");
    expect(body.copilot.available).toBe(true);
    expect(mockGetAIProvider).not.toHaveBeenCalled();
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
    expect(mockGetAIProvider).not.toHaveBeenCalled();
  });

  it("does not boot the Copilot SDK during status checks", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "testuser" },
      accessToken: "gho_abc123",
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(body.github.connected).toBe(true);
    expect(body.copilot.available).toBe(true);
    expect(body.copilot.error).toBeUndefined();
    expect(mockGetAIProvider).not.toHaveBeenCalled();
  });
});
