import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("middleware config", () => {
  it("excludes API routes from the auth middleware matcher", () => {
    const source = readFileSync(path.resolve(__dirname, "middleware.ts"), "utf8");

    expect(source).toContain(
      'matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]',
    );
  });
});
