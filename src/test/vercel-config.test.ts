import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type VercelFunctionConfig = {
  runtime?: string;
};

type VercelConfig = {
  functions?: Record<string, VercelFunctionConfig>;
};

describe("vercel config", () => {
  it("does not override Next.js function runtimes in vercel.json", () => {
    const configPath = path.join(process.cwd(), "vercel.json");
    const config = JSON.parse(
      readFileSync(configPath, "utf8"),
    ) as VercelConfig;

    for (const functionConfig of Object.values(config.functions ?? {})) {
      expect(functionConfig.runtime).toBeUndefined();
    }
  });
});
