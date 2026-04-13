import { test, expect } from "@playwright/test";

const E2E_USER_ID = "playwright-user";
const E2E_AUTH_COOKIE = {
  name: "questgen-e2e-auth",
  value: E2E_USER_ID,
  domain: "localhost",
  path: "/",
  sameSite: "Lax" as const,
};

test.describe("Game creation smoke", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([E2E_AUTH_COOKIE]);
  });

  test("creates a game and exposes it through the game and games APIs", async ({
    page,
  }) => {
    const description =
      "A grounded sci-fi recovery mission through a relay station where every maintenance decision has become a small political crisis.";

    await page.goto("/new-game");
    await page.getByLabel(/describe your adventure/i).fill(description);
    await page.getByText("Small", { exact: true }).click();

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/game/new") &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: /generate world/i }).click(),
    ]);

    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const createPayload = (await createResponse.json()) as {
      gameId: string;
      warnings?: string[];
    };

    expect(createPayload.gameId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await expect(page).toHaveURL(new RegExp(`/game/${createPayload.gameId}$`));

    const gameState = await page.evaluate(async (gameId) => {
      const res = await fetch(`/api/game/${gameId}`);
      return {
        status: res.status,
        body: (await res.json()) as {
          world?: { rooms?: Record<string, unknown>; startRoomId?: string };
          player?: { currentRoomId?: string };
        },
      };
    }, createPayload.gameId);

    expect(gameState.status).toBe(200);
    expect(Object.keys(gameState.body.world?.rooms ?? {})).not.toHaveLength(0);
    expect(gameState.body.player?.currentRoomId).toBe(
      gameState.body.world?.startRoomId,
    );

    const gameList = await page.evaluate(async () => {
      const res = await fetch("/api/games");
      return {
        status: res.status,
        body: (await res.json()) as {
          games?: Array<{ id: string; description: string }>;
        },
      };
    });

    expect(gameList.status).toBe(200);
    expect(
      gameList.body.games?.some(
        (game) =>
          game.id === createPayload.gameId && game.description === description,
      ),
    ).toBe(true);
  });
});
