import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { message: vi.fn() } }));

import { safeFetch } from "@/lib/offline/safe-fetch";

describe("safeFetch com rede instável", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("abandona uma leitura remota travada e retorna o cache local", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const remote = new Promise<string>(() => {});
    const fallback = vi.fn(async () => "cache local");

    const resultPromise = safeFetch(() => remote, fallback, { label: "visitas" });
    await vi.advanceTimersByTimeAsync(6_000);

    await expect(resultPromise).resolves.toBe("cache local");
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("mantém o resultado remoto se ele chegar dentro do prazo", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const fallback = vi.fn(async () => "cache local");

    await expect(safeFetch(async () => "servidor", fallback)).resolves.toBe("servidor");
    expect(fallback).not.toHaveBeenCalled();
  });
});
