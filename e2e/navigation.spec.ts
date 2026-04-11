import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("unknown routes fall back to the public landing page when auth is not configured", async ({
    page,
  }) => {
    await page.goto("/this-does-not-exist");
    await expect(page).toHaveURL(/\/$/);
  });
});
