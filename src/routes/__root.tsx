import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { useEffect } from "react";
import { initNetworkMonitor, onConnectivityChange } from "@/sync/networkMonitor";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PostBootErrorBoundary } from "@/components/PostBootErrorBoundary";

const __BOOT_T0 = typeof performance !== "undefined" ? performance.now() : Date.now();
const sinceBoot = () => Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - __BOOT_T0);
if (typeof window !== "undefined") {
  (window as any).__BOOT_T0 = __BOOT_T0;
  console.log("[APP_START]", { online: navigator.onLine, t: 0 });
}


import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const e = error as any;
  const msg = String(e?.message || error || "");
  const name = String(e?.name || "");
  const isNetwork =
    /Failed to fetch|NetworkError|Network request failed|fetch failed|Load failed/i.test(msg) ||
    (name === "TypeError" && /fetch/i.test(msg)) ||
    name === "AuthRetryableFetchError" ||
    (typeof navigator !== "undefined" && navigator.onLine === false);

  console.log("[ERROR_BOUNDARY_SOURCE]", {
    where: "root.errorComponent",
    network: isNetwork,
    name,
    message: msg,
    stack: String(e?.stack || "").split("\n").slice(0, 6).join("\n"),
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    sinceBoot: sinceBoot(),
  });

  // Erros de rede NUNCA bloqueiam a aplicação.
  // Auto-recupera silenciosamente: tenta agora e quando voltar online.
  useEffect(() => {
    if (!isNetwork) return;
    console.log("[POST_BOOT_ERROR] root errorComponent (rede) — auto-retry agendado", { sinceBoot: sinceBoot() });
    const t = setTimeout(() => {
      try { router.invalidate(); } catch {}
      try { reset(); } catch {}
    }, 250);
    const onOnline = () => {
      console.log("[POST_BOOT_ERROR] online restabelecido — invalidando");
      try { router.invalidate(); } catch {}
      try { reset(); } catch {}
    };
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", onOnline);
    };
  }, [isNetwork, reset, router]);

  if (isNetwork) {
    // Não bloquear — pequeno indicador discreto no canto.
    return (
      <div className="fixed bottom-4 right-4 z-[80] rounded-full bg-muted/90 px-3 py-1 text-[10px] text-muted-foreground shadow">
        Sincronizando…
      </div>
    );
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente novamente ou volte ao início.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Página inicial
          </a>
        </div>
      </div>
    </div>
  );
}



export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" },
      { title: "VetorControl - Combate às Endemias" },
      { name: "description", content: "Sistema de Controle Vetorial Urbano" },
      { name: "theme-color", content: "#0f172a" },
      { property: "og:title", content: "VetorControl - Combate às Endemias" },
      { property: "og:description", content: "Sistema de Controle Vetorial Urbano" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "VetorControl - Combate às Endemias" },
      { name: "twitter:description", content: "Sistema de Controle Vetorial Urbano" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/84ad7e97-8031-4253-b897-0dbbe888ccd4/id-preview-6e008d88--6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovable.app-1778865061247.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/84ad7e97-8031-4253-b897-0dbbe888ccd4/id-preview-6e008d88--6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovable.app-1778865061247.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
      { rel: "icon", type: "image/png", href: "/icon-512.png" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased selection:bg-primary/10">
        {children}
        <Toaster position="top-center" richColors />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  if (typeof window !== "undefined") {
    // Boot da camada offline (Dexie + fila de sincronização + guarda de rede)
    import("@/lib/offline/sync").then((m) => m.bootSyncEngine());
    import("@/lib/offline/network-guard").then((m) => m.installNetworkGuard());
    // PWA: registro guardado (não roda em dev/preview/iframe)
    import("@/lib/pwa/register").then((m) => m.registerPwa());
  }

  useEffect(() => {
    initNetworkMonitor();
    const unsub = onConnectivityChange(() => {});
    console.log("[AFTER_BOOT]", { sinceBoot: sinceBoot(), online: navigator.onLine });
    return unsub;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PostBootErrorBoundary>
          <Outlet />
        </PostBootErrorBoundary>
        <SyncStatusBadge />
        <OfflineBanner />
      </AuthProvider>
    </QueryClientProvider>
  );
}


if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}
