import { test, expect } from "@playwright/test";

test.describe("Guide page", () => {
  test("guide stays public when auth is not configured", async ({ page }) => {
    await page.goto("/guide");
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.locator("body")).toContainText(/CONNECT GITHUB COPILOT/i);
  });
});
