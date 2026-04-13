import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ...process.env,
      GITHUB_ID: "",
      GITHUB_SECRET: "",
      AUTH_SECRET: "playwright-auth-secret",
      NEXTAUTH_URL: "http://localhost:3100",
      AUTH_TRUST_HOST: "true",
      QUESTGEN_E2E_AUTH_BYPASS: "1",
      QUESTGEN_E2E_AUTH_USER_ID: "playwright-user",
      QUESTGEN_STUB_AI: "1",
      QUESTGEN_STUB_STORAGE: "1",
    },
  },
});
