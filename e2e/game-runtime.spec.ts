import { test, expect } from "@playwright/test";

const E2E_USER_ID = "playwright-user";
const E2E_AUTH_COOKIE = {
  name: "questgen-e2e-auth",
  value: E2E_USER_ID,
  domain: "localhost",
  path: "/",
  sameSite: "Lax" as const,
};

function extractFirstVisibleExit(text: string | null): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(/\b(north|south|east|west|up|down)\b\s*→/i);
  return match?.[1]?.toLowerCase() ?? null;
}

test.describe("Live game runtime", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([E2E_AUTH_COOKIE]);
  });

  test("creates a game, narrates successful movement, and handles /admin", async ({
    page,
  }) => {
    await page.goto("/new-game");

    await page.getByLabel(/describe your adventure/i).fill(
      "A grounded sci-fi salvage mission through a derelict orbital relay full of failed maintenance plans.",
    );
    await page.getByText("Small", { exact: true }).click();
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/game/new") &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: /generate world/i }).click(),
    ]);

    const createResponseBody = await createResponse.text();
    expect(createResponse.status(), createResponseBody).toBe(201);

    await expect(page).toHaveURL(/\/game\//);
    await expect(page.getByLabel("Command input")).toBeVisible();

    const firstExit = extractFirstVisibleExit(await page.locator("body").textContent());
    expect(firstExit).toBeTruthy();

    await page.getByLabel("Command input").fill(firstExit!);
    await page.getByLabel("Command input").press("Enter");

    await expect(page.locator("[data-role='player']").last()).toContainText(firstExit!);
    await expect(page.locator("[data-role='narrator']").last()).toContainText(
      new RegExp(`You move ${firstExit!} to`, "i"),
    );
    await expect(page.locator("body")).not.toContainText(/Unknown slash command\./i);

    await page.getByLabel("Command input").fill(
      "/admin why did the narrator say movement failed?",
    );
    await page.getByLabel("Command input").press("Enter");

    await expect(page.locator("[data-role='narrator']").last()).toContainText(
      /engine facts|move succeeded|validated result/i,
    );
    await expect(page.locator("body")).not.toContainText(/Unknown slash command\./i);
  });
});
