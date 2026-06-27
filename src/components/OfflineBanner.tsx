import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Banner discreto e não-bloqueante.
 * Exibido somente quando o dispositivo está offline.
 * NUNCA impede o uso do aplicativo.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOffline(navigator.onLine === false);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full bg-amber-500/95 text-amber-950 px-4 py-2 text-xs font-bold shadow-lg backdrop-blur md:bottom-4"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      Sem conexão. Modo Offline ativo.
    </div>
  );
}
