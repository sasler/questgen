import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("app loads and has correct title", async ({ page }) => {
    await page.goto("/setup");
    await expect(page).toHaveTitle(/QuestGen/i);
  });

  test("landing page stays public when auth is not configured", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("body")).toContainText(/OWNER SETUP/i);
    await expect(page.locator("body")).toContainText(/not ready for github copilot sign-in yet/i);
  });
});
