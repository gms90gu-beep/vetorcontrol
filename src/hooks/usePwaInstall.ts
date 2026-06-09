import { useCallback, useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let cachedPrompt: BIPEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedPrompt = e as BIPEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    cachedPrompt = null;
    notify();
  });
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(!!cachedPrompt);
  const [installed, setInstalled] = useState<boolean>(detectStandalone());

  useEffect(() => {
    const update = () => {
      setCanInstall(!!cachedPrompt);
      setInstalled(detectStandalone());
    };
    listeners.add(update);
    update();
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onChange = () => setInstalled(detectStandalone());
    mql?.addEventListener?.("change", onChange);
    return () => {
      listeners.delete(update);
      mql?.removeEventListener?.("change", onChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!cachedPrompt) return "unavailable";
    try {
      await cachedPrompt.prompt();
      const { outcome } = await cachedPrompt.userChoice;
      if (outcome === "accepted") {
        cachedPrompt = null;
        notify();
      }
      return outcome;
    } catch {
      return "unavailable";
    }
  }, []);

  return { canInstall, installed, promptInstall };
}
