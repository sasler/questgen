import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("unknown routes redirect to setup when auth is not configured", async ({
    page,
  }) => {
    await page.goto("/this-does-not-exist");
    // Without auth env vars, middleware redirects to /setup
    await expect(page).toHaveURL(/\/setup/);
  });
});
