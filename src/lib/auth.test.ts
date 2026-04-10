import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next-auth before importing modules that use it
const mockNextAuth = vi.fn();
vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    mockNextAuth(config);
    return {
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));

vi.mock("next-auth/providers/github", () => ({
  default: vi.fn((opts: unknown) => ({ id: "github", ...opts })),
}));

describe("auth config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockNextAuth.mockClear();
  });

  it("exports handlers, auth, signIn, signOut", async () => {
    const authModule = await import("./auth");
    expect(authModule.handlers).toBeDefined();
    expect(authModule.handlers.GET).toBeDefined();
    expect(authModule.handlers.POST).toBeDefined();
    expect(authModule.auth).toBeDefined();
    expect(authModule.signIn).toBeDefined();
    expect(authModule.signOut).toBeDefined();
  });

  it("jwt callback stores access token from account", async () => {
    const authModule = await import("./auth");
    // Extract the config passed to NextAuth
    const config = mockNextAuth.mock.calls[0][0];
    const jwtCallback = config.callbacks.jwt;

    const token = { sub: "user-123" };
    const account = {
      access_token: "gho_test_token_abc",
      provider: "github",
    };

    const result = await jwtCallback({ token, account });
    expect(result.accessToken).toBe("gho_test_token_abc");
    expect(result.provider).toBe("github");
  });

  it("jwt callback preserves token when no account", async () => {
    const authModule = await import("./auth");
    const config = mockNextAuth.mock.calls[0][0];
    const jwtCallback = config.callbacks.jwt;

    const token = {
      sub: "user-123",
      accessToken: "existing_token",
      provider: "github",
    };

    const result = await jwtCallback({ token, account: null });
    expect(result.accessToken).toBe("existing_token");
    expect(result.provider).toBe("github");
  });

  it("session callback passes access token to session", async () => {
    const authModule = await import("./auth");
    const config = mockNextAuth.mock.calls[0][0];
    const sessionCallback = config.callbacks.session;

    const session = { user: { name: "Test" }, expires: "2099-01-01" };
    const token = { accessToken: "gho_test_token_abc" };

    const result = await sessionCallback({ session, token });
    expect(result.accessToken).toBe("gho_test_token_abc");
  });
});

// Tests for auth-utils
describe("auth-utils", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("requireAuth returns null for unauthenticated requests", async () => {
    // Re-mock auth to return null session
    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(null),
    }));

    const { requireAuth } = await import("./auth-utils");
    const result = await requireAuth();
    expect(result).toBeNull();
  });

  it("requireAuth returns session for authenticated requests", async () => {
    const mockSession = {
      user: { name: "Test User", email: "test@example.com" },
      accessToken: "gho_abc123",
    };

    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(mockSession),
    }));

    const { requireAuth } = await import("./auth-utils");
    const result = await requireAuth();
    expect(result).toEqual(mockSession);
  });

  it("withAuth wrapper returns 401 for unauthenticated requests", async () => {
    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(null),
    }));

    const { withAuth } = await import("./auth-utils");
    const handler = vi.fn();
    const wrappedHandler = withAuth(handler);

    const req = new Request("http://localhost:3000/api/test");
    const response = await wrappedHandler(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });

  it("withAuth wrapper calls handler for authenticated requests", async () => {
    const mockSession = {
      user: { name: "Test User" },
      accessToken: "gho_abc123",
    };

    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(mockSession),
    }));

    const { withAuth } = await import("./auth-utils");

    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });
    const handler = vi.fn().mockResolvedValue(mockResponse);
    const wrappedHandler = withAuth(handler);

    const req = new Request("http://localhost:3000/api/test");
    const response = await wrappedHandler(req);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(req, mockSession);
  });
});
