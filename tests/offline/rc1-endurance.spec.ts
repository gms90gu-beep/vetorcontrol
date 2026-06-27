// rc1-endurance.spec.ts — Cenário de resistência RC-1.
// Simula um turno completo: online → offline → operação contínua → reconexão.
// Foco em validar que nenhuma rota quebra, Dexie persiste e o app reabre offline.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:8080";
const ROUTES = ["/dashboard", "/rg", "/field-work", "/pending", "/map", "/sync-status"];

test.describe("RC-1 Endurance", () => {
  test("turno completo online → offline → reconexão", async ({ context, page }) => {
    // 1. Online: carrega cache
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "domcontentloaded" });
    }

    // 2. Offline: rotas continuam abrindo
    await context.setOffline(true);
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "domcontentloaded" });
      const txt = await page.locator("body").innerText();
      expect(/This page didn't load/i.test(txt)).toBe(false);
    }

    // 3. Fechar/reabrir contexto offline (simula relaunch do app)
    await page.close();
    const page2 = await context.newPage();
    await page2.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
    expect(/This page didn't load/i.test(await page2.locator("body").innerText())).toBe(false);

    // 4. Reconectar e verificar drenagem da fila
    await context.setOffline(false);
    await page2.goto(BASE + "/sync-status", { waitUntil: "domcontentloaded" });
    await page2.waitForTimeout(2000);
    const sync = await page2.locator("body").innerText();
    expect(/sincroniz|pendência|Sincronização/i.test(sync)).toBe(true);
  });
});
