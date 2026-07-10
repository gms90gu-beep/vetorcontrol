import { test, expect } from "@playwright/test";
import { restoreSupabaseSession, skipIfNoSession } from "./helpers/session";

test("dashboard route loads", async ({ page, context }) => {
  skipIfNoSession(test);
  await restoreSupabaseSession(context, page);
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("relatorios route loads", async ({ page, context }) => {
  skipIfNoSession(test);
  await restoreSupabaseSession(context, page);
  await page.goto("/reports");
  await expect(page.locator("body")).toBeVisible();
});
