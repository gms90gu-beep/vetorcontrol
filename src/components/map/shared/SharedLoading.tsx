import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export function SharedLoading({ label = "Carregando mapa…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-50/95 animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}

export function SharedMapSkeleton() {
  return (
    <div className="absolute inset-0 p-3 animate-in fade-in duration-200">
      <Skeleton className="h-full w-full rounded-md" />
    </div>
  );
}
