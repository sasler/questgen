import { test, expect } from "@playwright/test";

test.describe("Guide page", () => {
  test("guide redirects to setup when auth is not configured", async ({
    page,
  }) => {
    await page.goto("/guide");
    // Without auth env vars, middleware redirects non-setup routes to /setup
    await expect(page).toHaveURL(/\/setup/);
  });
});
