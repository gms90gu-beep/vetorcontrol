import { test, expect } from "@playwright/test";
import { restoreSupabaseSession, skipIfNoSession } from "./helpers/session";

test.describe("Jornada", () => {
  test("dashboard carrega quando autenticado", async ({ page, context }) => {
    skipIfNoSession(test);
    await restoreSupabaseSession(context, page);
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("acessar página de trabalho de campo", async ({ page, context }) => {
    skipIfNoSession(test);
    await restoreSupabaseSession(context, page);
    await page.goto("/field-work");
    await expect(page.locator("body")).toBeVisible();
  });
});
