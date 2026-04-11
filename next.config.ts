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
  "node_modules/@github/copilot/*.wasm",
  "node_modules/@github/copilot/queries/*.scm",
  "node_modules/@github/copilot/prebuilds/linux-*/**/*",
  "node_modules/@github/copilot/sdk/index.js",
  "node_modules/@github/copilot/sharp/index.js",
  "node_modules/@github/copilot/sharp/node_modules/@emnapi/runtime/index.js",
  "node_modules/@github/copilot/sharp/node_modules/@emnapi/runtime/package.json",
  "node_modules/@github/copilot/sharp/node_modules/@emnapi/runtime/dist/emnapi.cjs.js",
  "node_modules/@github/copilot/sharp/node_modules/@img/sharp-wasm32/package.json",
  "node_modules/@github/copilot/sharp/node_modules/@img/sharp-wasm32/versions.json",
  "node_modules/@github/copilot/sharp/node_modules/@img/sharp-wasm32/lib/sharp-wasm32.node.js",
  "node_modules/@github/copilot/sharp/node_modules/@img/sharp-wasm32/lib/sharp-wasm32.node.wasm",
  "node_modules/@github/copilot/clipboard/index.js",
  "node_modules/@github/copilot/clipboard/node_modules/@teddyzhu/clipboard/package.json",
  "node_modules/@github/copilot/clipboard/node_modules/@teddyzhu/clipboard/index.js",
  "node_modules/@github/copilot/clipboard/node_modules/@teddyzhu/clipboard-linux-*-gnu/package.json",
  "node_modules/@github/copilot/clipboard/node_modules/@teddyzhu/clipboard-linux-*-gnu/*.node",
  "node_modules/@github/copilot/ripgrep/bin/linux-*/**/*",
  "node_modules/@github/copilot/schemas/*.json",
  "node_modules/@github/copilot/definitions/*.yaml",
  "node_modules/@github/copilot/builtin-skills/customizing-copilot-cloud-agents-environment/SKILL.md",
  "node_modules/@github/copilot/preloads/*.mjs",
  "node_modules/@github/copilot/copilot-sdk/index.js",
  "node_modules/@github/copilot/copilot-sdk/extension.js",
] as const;

const copilotSdkTrace = [
  "node_modules/@github/copilot-sdk/package.json",
  "node_modules/@github/copilot-sdk/dist/cjs/**/*",
  "node_modules/@github/copilot-sdk/dist/*.js",
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
