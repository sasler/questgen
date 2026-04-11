import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("next config", () => {
  it("pins turbopack and output tracing to the repo root", () => {
    expect(nextConfig.turbopack?.root).toBe(process.cwd());
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
  });
});
