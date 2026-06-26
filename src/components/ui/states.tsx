import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Inbox, Loader2, Lock, SearchX, WifiOff,
} from "lucide-react";

interface BaseStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

function StateShell({ title, description, icon, action, className, tone = "default" }: BaseStateProps & { tone?: "default" | "danger" | "warning" }) {
  const toneCls =
    tone === "danger" ? "text-danger bg-danger-soft" :
    tone === "warning" ? "text-warning-foreground bg-warning-soft" :
    "text-muted-foreground bg-muted";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-subtle bg-card/50 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className={cn("grid h-12 w-12 place-items-center rounded-2xl", toneCls)} aria-hidden>
          {icon}
        </div>
      )}
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function EmptyState(p: BaseStateProps) {
  return <StateShell icon={<Inbox className="h-5 w-5" />} title="Sem dados" {...p} />;
}
export function NoResultsState(p: BaseStateProps) {
  return <StateShell icon={<SearchX className="h-5 w-5" />} title="Nenhum resultado" {...p} />;
}
export function ErrorState(p: BaseStateProps & { onRetry?: () => void }) {
  const { onRetry, action, ...rest } = p;
  return (
    <StateShell
      tone="danger"
      icon={<AlertTriangle className="h-5 w-5" />}
      title="Ocorreu um erro"
      description="Não foi possível carregar os dados."
      action={action ?? (onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Tentar novamente</Button>)}
      {...rest}
    />
  );
}
export function OfflineState(p: BaseStateProps) {
  return (
    <StateShell
      tone="warning"
      icon={<WifiOff className="h-5 w-5" />}
      title="Você está offline"
      description="Os dados serão sincronizados quando a conexão voltar."
      {...p}
    />
  );
}
export function NoPermissionState(p: BaseStateProps) {
  return (
    <StateShell
      tone="warning"
      icon={<Lock className="h-5 w-5" />}
      title="Sem permissão"
      description="Você não tem acesso a este recurso."
      {...p}
    />
  );
}
export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
export function InlineSpinner({ label = "Carregando" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      {label}
    </span>
  );
}
