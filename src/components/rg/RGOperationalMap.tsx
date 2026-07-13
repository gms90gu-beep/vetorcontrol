// Mapa Geográfico do RG — visualização espacial dos imóveis do quarteirão.
// Sem rotas, sem navegação. Apenas distribuição geográfica + sync com a lista do RG.
// Regra: nenhum import direto de Leaflet — tudo via @/components/map/shared.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import {
  SharedMap,
  SharedNumberedMarkerLayer,
  SharedUserLocationLayer,
  type NumberedPoint,
} from "@/components/map/shared";
import { cn } from "@/lib/utils";
import { comparePropertyOrder } from "@/lib/property-order";
import {
  Home, AlertTriangle, Flame, CheckCircle2,
  Landmark, Trees, X, LocateFixed,
} from "lucide-react";

export type RGMapProperty = {
  id: string;
  number: string;
  sequence: number | null;
  complement: string | null;
  street_name: string | null;
  side?: string | null;
  type: string | null;
  inhabitants: number | null;
  latitude: number | null;
  longitude: number | null;
  had_previous_focus?: boolean | null;
  status?: string | null;
  accuracy?: number | null;
};

interface Props {
  blockNumber: string | null;
  agentName?: string | null;
  properties: RGMapProperty[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose?: () => void;
  className?: string;
}

type Kind = "focus" | "closed" | "visited" | "pending" | "strategic" | "vacant";

const KIND_COLOR: Record<Kind, string> = {
  focus: "#ef4444", closed: "#2563eb", visited: "#10b981",
  pending: "#f97316", strategic: "#a855f7", vacant: "#1f2937",
};
const KIND_LABEL: Record<Kind, string> = {
  focus: "Foco positivo", closed: "Fechado", visited: "Visitado",
  pending: "Pendente", strategic: "Ponto Estratégico", vacant: "Terreno Baldio",
};

function normType(t: string | null | undefined): string { return (t || "").toLowerCase(); }
function classify(p: RGMapProperty): Kind {
  if (p.had_previous_focus) return "focus";
  const t = normType(p.type);
  if (t === "strategic_point" || t === "pe") return "strategic";
  if (t === "vacant_lot" || t === "tb") return "vacant";
  const s = (p.status || "").toLowerCase();
  if (s === "closed" || s === "refused") return "closed";
  if (s === "visited") return "visited";
  return "pending";
}
function tipoSigla(t: string | null | undefined): string {
  const x = normType(t);
  if (x === "residence" || x === "residential" || x === "r") return "R";
  if (x === "commerce" || x === "commercial" || x === "c") return "C";
  if (x === "vacant_lot" || x === "tb") return "TB";
  if (x === "strategic_point" || x === "pe") return "PE";
  return "O";
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
function fmtCoord(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(6);
}

export function RGOperationalMap({
  blockNumber, agentName, properties, selectedId, onSelect, onClose, className,
}: Props) {
  const ordered = useMemo(() => [...properties].sort(comparePropertyOrder), [properties]);
  const enriched = useMemo(() => ordered.map((p, i) => {
    const kind = classify(p);
    const label = p.sequence != null ? p.sequence : i + 1;
    return { p, kind, label };
  }), [ordered]);

  const totals = useMemo(() => {
    const t = { total: ordered.length, visited: 0, pending: 0, focus: 0, closed: 0, strategic: 0, vacant: 0 };
    for (const e of enriched) {
      if (e.kind === "focus") t.focus++;
      else if (e.kind === "closed") t.closed++;
      else if (e.kind === "visited") t.visited++;
      else if (e.kind === "strategic") t.strategic++;
      else if (e.kind === "vacant") t.vacant++;
      else t.pending++;
    }
    return t;
  }, [enriched, ordered.length]);

  const points: NumberedPoint[] = useMemo(() => enriched
    .filter((e) => e.p.latitude != null && e.p.longitude != null)
    .map(({ p, kind, label }) => {
      const color = KIND_COLOR[kind];
      const acc = p.accuracy != null ? `${Math.round(p.accuracy)} m` : "—";
      const addr = [p.street_name, p.side ? `Lado ${p.side}` : null].filter(Boolean).join(" · ");
      const popup = `
        <div style="font-family:system-ui;font-size:12px;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font-weight:800;font-size:11px">${label}</span>
            <b style="font-size:13px">Nº ${escapeHtml(String(p.number ?? "—"))}${p.complement ? " · " + escapeHtml(p.complement) : ""}</b>
          </div>
          <div style="color:#475569;margin-bottom:6px">${escapeHtml(addr || "—")}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;color:#334155">
            <span style="color:#64748b">Sequência</span><b>#${label}</b>
            <span style="color:#64748b">Tipo</span><b>${tipoSigla(p.type)}</b>
            <span style="color:#64748b">Hab.</span><b>${p.inhabitants ?? 0}</b>
            <span style="color:#64748b">Agente</span><b>${escapeHtml(agentName || "—")}</b>
            <span style="color:#64748b">Situação</span><b style="color:${color}">${KIND_LABEL[kind]}</b>
            <span style="color:#64748b">Coordenadas</span><b>${fmtCoord(p.latitude)}, ${fmtCoord(p.longitude)}</b>
            <span style="color:#64748b">Precisão GPS</span><b>${acc}</b>
          </div>
        </div>`;
      return {
        id: p.id,
        lat: p.latitude as number,
        lng: p.longitude as number,
        label, color, popupHtml: popup,
        tooltip: `#${label} · Nº ${p.number ?? "—"}`,
      };
    }), [enriched, agentName]);

  const geoCount = points.length;

  // Instância do mapa (para centralizar na posição do agente sob demanda).
  const [mapInst, setMapInst] = useState<L.Map | null>(null);

  // Geolocalização — apenas sob demanda.
  const [gpsOn, setGpsOn] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const startWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Geolocalização indisponível neste dispositivo.");
      return;
    }
    setGpsError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPos({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      }),
      (err) => {
        setGpsError(err.message || "Falha ao obter localização.");
        setGpsOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    watchIdRef.current = id;
  }, []);

  useEffect(() => {
    if (gpsOn) startWatch();
    else { stopWatch(); setUserPos(null); }
    return () => stopWatch();
  }, [gpsOn, startWatch, stopWatch]);

  // Centraliza no usuário assim que a primeira leitura chega após ligar o GPS.
  const centeredOnceRef = useRef(false);
  useEffect(() => {
    if (!gpsOn) { centeredOnceRef.current = false; return; }
    if (!mapInst || !userPos || centeredOnceRef.current) return;
    mapInst.setView([userPos.lat, userPos.lng], Math.max(mapInst.getZoom(), 17), { animate: true });
    centeredOnceRef.current = true;
  }, [gpsOn, userPos, mapInst]);

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-prop-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <section className={cn("grid gap-3 md:grid-cols-[320px_minmax(0,1fr)]", "brg-no-print", className)}>
      <aside className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col min-h-0 md:max-h-[78vh]">
        <header className="flex items-center justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Mapa Geográfico</div>
            <div className="text-sm font-black truncate">Quarteirão {blockNumber ?? "—"}</div>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Fechar mapa" className="p-1 rounded hover:bg-slate-100 text-slate-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="grid grid-cols-3 gap-1.5 text-center">
          <Kpi icon={<Home className="h-3.5 w-3.5" />} label="Total" value={totals.total} tone="slate" />
          <Kpi icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Visit." value={totals.visited} tone="emerald" />
          <Kpi icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Pend." value={totals.pending} tone="orange" />
          <Kpi icon={<Flame className="h-3.5 w-3.5" />} label="Focos" value={totals.focus} tone="red" />
          <Kpi icon={<Landmark className="h-3.5 w-3.5" />} label="Fech." value={totals.closed} tone="blue" />
          <Kpi icon={<Trees className="h-3.5 w-3.5" />} label="TB/PE" value={totals.vacant + totals.strategic} tone="slate" />
        </div>

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setGpsOn((v) => !v)}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-[11px] font-bold uppercase tracking-wide border transition",
              gpsOn
                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
            )}
            title="Mostra sua posição atual no mapa"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {gpsOn ? "Ocultar minha localização" : "Minha localização"}
          </button>
        </div>

        {gpsError && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700">
            {gpsError}
          </div>
        )}

        <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Imóveis ({geoCount}/{totals.total} no mapa)
        </div>

        <div ref={listRef} className="mt-1 flex-1 min-h-0 overflow-auto rounded-md border border-slate-100">
          {enriched.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">Sem imóveis.</div>
          ) : (
            <ul>
              {enriched.map(({ p, kind, label }) => {
                const isSel = p.id === selectedId;
                const hasGeo = p.latitude != null && p.longitude != null;
                return (
                  <li key={p.id} data-prop-id={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs border-b border-slate-100 transition",
                        isSel ? "bg-blue-50" : "hover:bg-slate-50",
                        !hasGeo && "opacity-70",
                      )}
                    >
                      <span
                        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-black text-white shrink-0"
                        style={{ background: KIND_COLOR[kind] }}
                        title={KIND_LABEL[kind]}
                      >
                        {label}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate text-slate-800">
                          Nº {p.number}{p.complement ? ` · ${p.complement}` : ""}
                        </span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {p.street_name || "—"} · {tipoSigla(p.type)}
                          {!hasGeo && " · sem GPS"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="min-h-0">
        <SharedMap
          height="78vh"
          isEmpty={ordered.length === 0 || geoCount === 0}
          emptyVariant={ordered.length === 0 ? "no-data" : "no-geo"}
          legend="none"
          onReady={setMapInst}
        >
          <SharedNumberedMarkerLayer
            points={points}
            selectedId={selectedId}
            onClick={onSelect}
          />
          {gpsOn && userPos && (
            <SharedUserLocationLayer
              lat={userPos.lat}
              lng={userPos.lng}
              accuracy={userPos.accuracy}
            />
          )}
        </SharedMap>
        <MapLegend />
      </div>
    </section>
  );
}

function Kpi({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "slate" | "emerald" | "orange" | "red" | "blue" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <div className={cn("rounded-md border px-1 py-1.5", tones[tone])}>
      <div className="flex items-center justify-center gap-1 opacity-80">{icon}</div>
      <div className="text-sm font-black leading-none mt-0.5">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</div>
    </div>
  );
}

function MapLegend() {
  const entries: { kind: Kind }[] = [
    { kind: "visited" }, { kind: "pending" }, { kind: "closed" },
    { kind: "focus" }, { kind: "strategic" }, { kind: "vacant" },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
      {entries.map(({ kind }) => (
        <span key={kind} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[kind] }} />
          {KIND_LABEL[kind]}
        </span>
      ))}
    </div>
  );
}
