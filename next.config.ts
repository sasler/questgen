import path from "node:path";
import type { NextConfig } from "next";

const copilotServerRoutes = [
  "/api/models",
  "/api/game/new",
  "/api/game/\\[id\\]/turn",
] as const;

const copilotRuntimeTrace = [
  "node_modules/@github/copilot-linux-*/package.json",
  "node_modules/@github/copilot-linux-*/copilot",
] as const;

const copilotSdkTrace = [
  "node_modules/@github/copilot-sdk/package.json",
  "node_modules/@github/copilot-sdk/dist/cjs/**/*",
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: path.resolve(process.cwd()),
  serverExternalPackages: ["@github/copilot-sdk"],
  outputFileTracingIncludes: Object.fromEntries(
    copilotServerRoutes.map((route) => [
      route,
      [...copilotRuntimeTrace, ...copilotSdkTrace],
    ]),
  ),
};

export default nextConfig;
