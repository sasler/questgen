import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("proxy config", () => {
  it("uses the proxy entrypoint and excludes API routes from the auth proxy matcher", () => {
    expect(existsSync(path.resolve(__dirname, "middleware.ts"))).toBe(false);

    const source = readFileSync(path.resolve(__dirname, "proxy.ts"), "utf8");

    expect(source).toContain(
      'matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]',
    );
  });
});
