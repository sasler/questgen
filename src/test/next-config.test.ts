import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("next config", () => {
  it("pins turbopack and output tracing to the repo root", () => {
    expect(nextConfig.turbopack?.root).toBe(process.cwd());
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
  });

  it("keeps Copilot runtime packages external for server routes", () => {
    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining(["@github/copilot-sdk"]),
    );
  });

  it("includes Copilot runtime files in traced server routes", () => {
    expect(nextConfig.outputFileTracingIncludes).toEqual(
      expect.objectContaining({
        "/api/models": expect.arrayContaining([
          "node_modules/@github/copilot-linux-*/package.json",
          "node_modules/@github/copilot-linux-*/copilot",
          "node_modules/@github/copilot-sdk/package.json",
          "node_modules/@github/copilot-sdk/dist/cjs/**/*",
        ]),
        "/api/game/new": expect.arrayContaining([
          "node_modules/@github/copilot-linux-*/package.json",
          "node_modules/@github/copilot-linux-*/copilot",
          "node_modules/@github/copilot-sdk/dist/cjs/**/*",
        ]),
        "/api/game/\\[id\\]/turn": expect.arrayContaining([
          "node_modules/@github/copilot-linux-*/package.json",
          "node_modules/@github/copilot-linux-*/copilot",
          "node_modules/@github/copilot-sdk/dist/cjs/**/*",
        ]),
        "/api/game/\\[id\\]/intro": expect.arrayContaining([
          "node_modules/@github/copilot-linux-*/package.json",
          "node_modules/@github/copilot-linux-*/copilot",
          "node_modules/@github/copilot-sdk/dist/cjs/**/*",
        ]),
      }),
    );
  });
});
