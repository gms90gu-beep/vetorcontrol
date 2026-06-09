import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, CloudUpload, CloudCheck, WifiOff } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { cn } from "@/lib/utils";

const TABLE_LABELS: Record<string, string> = {
  visits: "Visitas",
  visit_deposits: "Depósitos",
  field_work_sessions: "Jornadas",
  daily_work_records: "Relatórios diários",
  property_pendencies: "Pendências",
  property_recovery_attempts: "Recuperações",
  properties: "Imóveis",
  boletins_rg: "Boletins RG",
  agents: "Status do agente",
  "rpc:finalize_shift_pendencies": "Consolidação de pendências",
};

function fmtDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR");
}

export function SyncStatusModal({
  open,
  onOpenChange,
  onSyncNow,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSyncNow: () => Promise<void> | void;
}) {
  const { state, online, syncing, pending, byTable, lastSync } = useSyncStatus();

  const entries = Object.entries(byTable).sort((a, b) => b[1] - a[1]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state === "offline" ? <WifiOff className="h-5 w-5 text-red-500" />
              : state === "syncing" ? <RefreshCw className="h-5 w-5 text-amber-500 animate-spin" />
              : state === "synced" ? <CloudCheck className="h-5 w-5 text-sky-500" />
              : <CloudUpload className="h-5 w-5 text-emerald-500" />}
            Status da Sincronização
          </DialogTitle>
          <DialogDescription>
            {state === "offline" && "Modo Offline Ativo. Os registros estão salvos localmente."}
            {state === "syncing" && "Enviando registros para o servidor..."}
            {state === "synced" && "Todos os registros foram enviados."}
            {state === "online" && pending > 0 && "Alguns registros ainda aguardam sincronização."}
            {state === "online" && pending === 0 && "Conectado. Nenhuma pendência local."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Pendentes" value={pending} tone={pending > 0 ? "amber" : "emerald"} />
            <Stat label="Conexão" value={online ? "Online" : "Offline"} tone={online ? "emerald" : "red"} />
          </div>

          {entries.length > 0 ? (
            <div className="border rounded-lg divide-y">
              {entries.map(([k, n]) => (
                <div key={k} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium">{TABLE_LABELS[k] || k}</span>
                  <span className="text-sm font-black text-amber-600">{n}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum registro pendente.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            Última sincronização: <span className="font-medium">{fmtDate(lastSync)}</span>
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={() => onSyncNow()}
            disabled={!online || syncing || pending === 0}
            className="gap-2"
          >
            {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            Sincronizar agora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone: "emerald" | "amber" | "red" }) {
  const cls =
    tone === "amber" ? "bg-amber-500/10 border-amber-500/30 text-amber-700"
    : tone === "red" ? "bg-red-500/10 border-red-500/30 text-red-700"
    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}
