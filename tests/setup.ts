import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom lacks matchMedia
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!("onLine" in navigator)) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
}

// Reset Dexie between tests
beforeEach(async () => {
  const idb = (globalThis as any).indexedDB as IDBFactory & { _databases?: Map<string, unknown> };
  const anyIdb = idb as any;
  if (anyIdb?._databases?.clear) anyIdb._databases.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
