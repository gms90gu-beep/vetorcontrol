import type { BrowserContext, Page } from "@playwright/test";

export function skipIfNoSession(t: { skip: (r: boolean, m?: string) => void }) {
  const status = process.env.LOVABLE_BROWSER_AUTH_STATUS;
  if (status !== "injected") {
    t.skip(true, `Supabase session not injected (status=${status ?? "absent"})`);
  }
}

export async function restoreSupabaseSession(context: BrowserContext, page: Page) {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:8080";

  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson).map((c: any) => ({ ...c, url: baseURL }));
    await context.addCookies(cookies);
  }
  await page.goto(baseURL);
  if (storageKey && sessionJson) {
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [storageKey, sessionJson] as const);
  }
}
