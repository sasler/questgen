import { test, expect } from "@playwright/test";

test.describe("Setup page", () => {
  test("setup page renders with initialization title", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("body")).toContainText(/SYSTEM INITIALIZATION/i);
  });

  test("setup page shows configuration steps", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("body")).toContainText(/AUTH_SECRET/);
    await expect(page.locator("body")).toContainText(/GitHub OAuth/i);
    await expect(page.locator("body")).toContainText(/Upstash Redis/i);
  });

  test("setup page has generate secret button", async ({ page }) => {
    await page.goto("/setup");
    const generateBtn = page.getByRole("button", { name: /generate/i });
    await expect(generateBtn).toBeVisible();
  });

  test("generate button produces a secret value", async ({ page }) => {
    await page.goto("/setup");
    const generateBtn = page.getByRole("button", { name: /generate/i });
    await generateBtn.click();
    const secretEl = page.getByTestId("generated-secret");
    await expect(secretEl).toBeVisible();
    const text = await secretEl.textContent();
    expect(text!.length).toBeGreaterThan(20);
  });
});
