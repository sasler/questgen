import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthConfigured = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: (handler: (req: NextRequest & { auth?: unknown }) => Response) => {
    return (req: NextRequest) => {
      Object.defineProperty(req, "auth", {
        value: null,
        configurable: true,
      });
      return handler(req);
    };
  },
  isAuthConfigured: () => mockAuthConfigured(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getE2EBypassSession: () => null,
}));

beforeEach(() => {
  mockAuthConfigured.mockReturnValue(true);
});

describe("proxy config", () => {
  it("uses the proxy entrypoint and excludes API routes from the auth proxy matcher", () => {
    expect(existsSync(path.resolve(__dirname, "middleware.ts"))).toBe(false);

    const source = readFileSync(path.resolve(__dirname, "proxy.ts"), "utf8");

    expect(source).toContain(
      'matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]',
    );
    expect(source).toContain('pathname === "/settings"');
    expect(source).toContain('pathname === "/new-game"');
    expect(source).toContain('pathname === "/dashboard"');
    expect(source).toContain('pathname.startsWith("/game/")');
  });

  it.each(["/settings", "/new-game", "/dashboard", "/game/test-game"])(
    "allows unauthenticated guest access to %s when auth is configured",
    async (pathname) => {
      vi.resetModules();
      const { default: proxy } = await import("./proxy");

      const response = proxy(new NextRequest(`https://questgen.test${pathname}`));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("still redirects unauthenticated protected pages when auth is configured", async () => {
    vi.resetModules();
    const { default: proxy } = await import("./proxy");

    const response = proxy(new NextRequest("https://questgen.test/protected"));

    expect(response.headers.get("location")).toBe(
      "https://questgen.test/api/auth/signin?callbackUrl=%2Fprotected",
    );
  });
});
