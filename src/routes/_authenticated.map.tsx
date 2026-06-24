import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const OperationalMapView = lazy(() => {
  console.log("[MAP_LAZY_START]");
  return import("@/components/map/OperationalMapView")
    .then((mod) => {
      console.log("[MAP_LAZY_SUCCESS]");
      return mod;
    })
    .catch((err) => {
      console.error("[MAP_IMPORT_ERROR]", {
        message: (err as Error).message,
        stack: (err as Error).stack,
      });
      throw err;
    });
});

function MapRouteErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[MAP_ROUTE_ERROR_BOUNDARY]", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  }, [error]);
  return (
    <div className="container mx-auto max-w-3xl p-6">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
        <h2 className="text-lg font-semibold text-destructive">Falha ao carregar o mapa</h2>
        <p className="text-sm text-muted-foreground">
          Verifique o console (procure por <code>[MAP_*]</code>) para o stack trace completo.
        </p>
        <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-64 whitespace-pre-wrap">
{error.name}: {error.message}
{error.stack}
        </pre>
        <button
          onClick={() => reset()}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

function MapNotFound() {
  return <div className="p-6 text-sm">Rota não encontrada.</div>;
}

function MapPage() {
  // ClientOnly gate — leaflet touches `window` at import time
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    console.log("[MAP_INIT] client mount");
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <OperationalMapView />
    </Suspense>
  );
}

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
  errorComponent: MapRouteErrorComponent,
  notFoundComponent: MapNotFound,
});
