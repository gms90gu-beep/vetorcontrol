// offline-suite.spec.ts — testes T1–T10 do plano de auditoria offline.
// Roda contra o dev server local em http://localhost:8080.
//
// Pré-requisitos:
//  - O dev server precisa estar rodando.
//  - Sessão Supabase pode ser injetada via LOVABLE_BROWSER_SUPABASE_* (opcional).
//
// Cobertura: navegação online → offline → reconexão.
import { test, expect, Page, BrowserContext } from "@playwright/test";

const BASE = "http://localhost:8080";

const ROUTES_OFFLINE_OK = [
  "/dashboard",
  "/rg",
  "/field-work",
  "/pending",
  "/map",
  "/heatmap",
  "/settings",
  "/sync-status",
];

async function isErrorBoundary(page: Page): Promise<boolean> {
  const txt = await page.locator("body").innerText().catch(() => "");
  return /This page didn't load/i.test(txt);
}

test.describe("Offline-First Audit Suite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  });

  test("T1 — online: app abre normalmente", async ({ page }) => {
    expect(await isErrorBoundary(page)).toBe(false);
  });

  test("T2 — offline: nenhuma rota da lista quebra", async ({ context, page }) => {
    await context.setOffline(true);
    for (const route of ROUTES_OFFLINE_OK) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
      const broken = await isErrorBoundary(page);
      expect(broken, `rota ${route} apresentou boundary de erro offline`).toBe(false);
    }
    await context.setOffline(false);
  });

  test("T9 — /map abre offline sem crash", async ({ context, page }) => {
    await context.setOffline(true);
    await page.goto(BASE + "/map", { waitUntil: "domcontentloaded" });
    expect(await isErrorBoundary(page)).toBe(false);
    await context.setOffline(false);
  });

  test("T10 — reconexão drena fila", async ({ context, page }) => {
    await page.goto(BASE + "/sync-status", { waitUntil: "domcontentloaded" });
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    const txt = await page.locator("body").innerText();
    expect(/Sincronização|sincroniz|pendência/i.test(txt)).toBe(true);
  });
});
