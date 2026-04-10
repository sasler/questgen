import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("app loads and has correct title", async ({ page }) => {
    await page.goto("/setup");
    await expect(page).toHaveTitle(/QuestGen/i);
  });

  test("landing page redirects to setup when auth is not configured", async ({
    page,
  }) => {
    await page.goto("/");
    // Without auth env vars, middleware redirects to /setup
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.locator("body")).toContainText(/SYSTEM INITIALIZATION/i);
  });
});
