import { test, expect } from "@playwright/test";

/**
 * Smoke E2E — verifica que o app carrega e chega na tela de login/dashboard.
 * Sessão Supabase é injetada via LOVABLE_BROWSER_SUPABASE_* quando disponível.
 */
test.describe("Smoke", () => {
  test("home renders without crash", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/./);
    const body = await page.locator("body").textContent();
    expect(body?.length ?? 0).toBeGreaterThan(0);
  });

  test("auth route is reachable", async ({ page }) => {
    const res = await page.goto("/auth");
    expect(res?.status()).toBeLessThan(500);
  });
});
