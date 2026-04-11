import path from "node:path";
import type { NextConfig } from "next";

const copilotServerRoutes = [
  "/api/models",
  "/api/game/new",
  "/api/game/\\[id\\]/turn",
] as const;

const copilotRuntimeTrace = [
  "node_modules/@github/copilot/package.json",
  "node_modules/@github/copilot/index.js",
  "node_modules/@github/copilot/app.js",
  "node_modules/@github/copilot/npm-loader.js",
  "node_modules/@github/copilot/changelog.json",
  "node_modules/@github/copilot/conpty_console_list_agent.js",
  "node_modules/@github/copilot/*.wasm",
  "node_modules/@github/copilot/queries/**/*",
  "node_modules/@github/copilot/prebuilds/**/*",
  "node_modules/@github/copilot/sdk/**/*",
  "node_modules/@github/copilot/sharp/**/*",
  "node_modules/@github/copilot/clipboard/**/*",
  "node_modules/@github/copilot/worker/**/*",
  "node_modules/@github/copilot/ripgrep/**/*",
  "node_modules/@github/copilot/schemas/**/*",
  "node_modules/@github/copilot/definitions/**/*",
  "node_modules/@github/copilot/builtin-skills/**/*",
  "node_modules/@github/copilot/preloads/**/*",
  "node_modules/@github/copilot/copilot-sdk/**/*",
  "node_modules/@github/copilot-linux-*/**/*",
] as const;

const copilotSdkTrace = [
  "node_modules/@github/copilot-sdk/package.json",
  "node_modules/@github/copilot-sdk/dist/**/*",
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: path.resolve(process.cwd()),
  serverExternalPackages: ["@github/copilot", "@github/copilot-sdk"],
  outputFileTracingIncludes: Object.fromEntries(
    copilotServerRoutes.map((route) => [
      route,
      [...copilotRuntimeTrace, ...copilotSdkTrace],
    ]),
  ),
};

export default nextConfig;
