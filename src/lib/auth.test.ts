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
  default: vi.fn((opts: Record<string, unknown> = {}) => ({ id: "github", ...opts })),
}));

describe("auth config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockNextAuth.mockClear();
  });

  it("exports handlers, auth, signIn, signOut", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    const authModule = await import("./auth");
    expect(authModule.handlers).toBeDefined();
    expect(authModule.handlers.GET).toBeDefined();
    expect(authModule.handlers.POST).toBeDefined();
    expect(authModule.auth).toBeDefined();
    expect(authModule.signIn).toBeDefined();
    expect(authModule.signOut).toBeDefined();
    vi.unstubAllEnvs();
  });

  it("configures the GitHub provider with the GitHub OAuth issuer", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    await import("./auth");

    const config = mockNextAuth.mock.calls[0][0];
    expect(config.providers[0].issuer).toBe("https://github.com/login/oauth");

    vi.unstubAllEnvs();
  });

  it("falls back to GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
    await import("./auth");

    const config = mockNextAuth.mock.calls[0][0];
    expect(config.providers[0].clientId).toBe("client-id");
    expect(config.providers[0].clientSecret).toBe("client-secret");

    vi.unstubAllEnvs();
  });

  it("prefers GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET when both pairs are set", async () => {
    vi.stubEnv("GITHUB_ID", "legacy-id");
    vi.stubEnv("GITHUB_SECRET", "legacy-secret");
    vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
    await import("./auth");

    const config = mockNextAuth.mock.calls[0][0];
    expect(config.providers[0].clientId).toBe("client-id");
    expect(config.providers[0].clientSecret).toBe("client-secret");

    vi.unstubAllEnvs();
  });

  it("configures a custom auth error page", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    await import("./auth");

    const config = mockNextAuth.mock.calls[0][0];
    expect(config.pages.error).toBe("/auth/error");

    vi.unstubAllEnvs();
  });

  it("trusts the current host for local and proxied auth callbacks", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    await import("./auth");

    const config = mockNextAuth.mock.calls[0][0];
    expect(config.trustHost).toBe(true);

    vi.unstubAllEnvs();
  });

  it("jwt callback stores access token from account", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
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
    vi.unstubAllEnvs();
  });

  it("jwt callback stores a stable user id from token sub or provider account id", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    await import("./auth");
    const config = mockNextAuth.mock.calls[0][0];
    const jwtCallback = config.callbacks.jwt;

    const result = await jwtCallback({
      token: { sub: "github-user-123" },
      account: { providerAccountId: "provider-user-999" },
    });

    expect(result.userId).toBe("github-user-123");
    vi.unstubAllEnvs();
  });

  it("jwt callback preserves token when no account", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
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
    vi.unstubAllEnvs();
  });

  it("session callback passes access token to session", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    const authModule = await import("./auth");
    const config = mockNextAuth.mock.calls[0][0];
    const sessionCallback = config.callbacks.session;

    const session = { user: { name: "Test" }, expires: "2099-01-01" };
    const token = { accessToken: "gho_test_token_abc" };

    const result = await sessionCallback({ session, token });
    expect(result.accessToken).toBe("gho_test_token_abc");
    vi.unstubAllEnvs();
  });

  it("session callback hydrates session.user.id from the token", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    await import("./auth");
    const config = mockNextAuth.mock.calls[0][0];
    const sessionCallback = config.callbacks.session;

    const session = {
      user: { name: "Test", email: "test@example.com" },
      expires: "2099-01-01",
    };
    const token = { userId: "github-user-123", sub: "github-user-123" };

    const result = await sessionCallback({ session, token });

    expect(result.user.id).toBe("github-user-123");
    vi.unstubAllEnvs();
  });

  it("isAuthConfigured returns true when env vars set", async () => {
    vi.stubEnv("GITHUB_ID", "test-id");
    vi.stubEnv("GITHUB_SECRET", "test-secret");
    const { isAuthConfigured } = await import("./auth");
    expect(isAuthConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("isAuthConfigured returns true when fallback env vars are set", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "test-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-secret");
    const { isAuthConfigured } = await import("./auth");
    expect(isAuthConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("isAuthConfigured returns false when env vars missing", async () => {
    delete process.env.GITHUB_ID;
    delete process.env.GITHUB_SECRET;
    const { isAuthConfigured } = await import("./auth");
    expect(isAuthConfigured()).toBe(false);
  });

  it("auth() returns null when not configured", async () => {
    delete process.env.GITHUB_ID;
    delete process.env.GITHUB_SECRET;
    const { auth } = await import("./auth");
    const session = await auth();
    expect(session).toBeNull();
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

  it("resolveRequestSession accepts the e2e bypass cookie when enabled", async () => {
    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(null),
    }));
    vi.stubEnv("QUESTGEN_E2E_AUTH_BYPASS", "1");

    const { resolveRequestSession } = await import("./auth-utils");
    const request = new Request("http://localhost/game/test", {
      headers: {
        cookie: "questgen-e2e-auth=playwright-user",
      },
    });

    const session = await resolveRequestSession(request);
    expect(session?.user?.id).toBe("playwright-user");
    expect(session?.user?.email).toBe("playwright-user@e2e.questgen.local");

    vi.unstubAllEnvs();
  });

  it("resolveRequestSession rejects the e2e bypass cookie on non-local hosts", async () => {
    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(null),
    }));
    vi.stubEnv("QUESTGEN_E2E_AUTH_BYPASS", "1");

    const { resolveRequestSession } = await import("./auth-utils");
    const request = new Request("https://questgen.example.com/game/test", {
      headers: {
        cookie: "questgen-e2e-auth=playwright-user",
      },
    });

    const session = await resolveRequestSession(request);
    expect(session).toBeNull();

    vi.unstubAllEnvs();
  });

  it("resolveRequestSession ignores the e2e bypass cookie when disabled", async () => {
    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(null),
    }));

    const { resolveRequestSession } = await import("./auth-utils");
    const request = new Request("http://localhost/game/test", {
      headers: {
        cookie: "questgen-e2e-auth=playwright-user",
      },
    });

    const session = await resolveRequestSession(request);
    expect(session).toBeNull();
  });

  it("resolveRequestSession ignores malformed e2e bypass cookies", async () => {
    vi.doMock("./auth", () => ({
      auth: vi.fn().mockResolvedValue(null),
    }));
    vi.stubEnv("QUESTGEN_E2E_AUTH_BYPASS", "1");
    vi.stubEnv("QUESTGEN_E2E_AUTH_USER_ID", "playwright-user");

    const { resolveRequestSession } = await import("./auth-utils");
    const request = new Request("http://localhost/game/test", {
      headers: {
        cookie: "questgen-e2e-auth=%E0%A4%A",
      },
    });

    const session = await resolveRequestSession(request);
    expect(session?.user?.id).toBe("playwright-user");

    vi.unstubAllEnvs();
  });
});
