// Mapa Geográfico do RG — visualização espacial dos imóveis do quarteirão.
// Sem rotas, sem navegação. Apenas distribuição geográfica + sync com a lista do RG.
// Regra: nenhum import direto de Leaflet — tudo via @/components/map/shared.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  SharedMap,
  SharedMapControls,
  SharedNumberedMarkerLayer,
  SharedRouteLayer,
  SharedUserLocationLayer,
  useFitBounds,
  type NumberedPoint,
} from "@/components/map/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { comparePropertyOrder } from "@/lib/property-order";
import { X, LocateFixed } from "lucide-react";

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
  // Status real de campo (última visita), fonte preferida para classify() — vem de
  // `visits.status`, não confundir com `status` acima (property_status, quase estático).
  visit_status?: string | null;
  accuracy?: number | null;
  // Timestamp de georreferenciamento — usado só para desenhar a linha-guia do
  // mapa na ordem cronológica real da caminhada em campo.
  geocoded_at?: string | null;
};

interface Props {
  blockNumber: string | null;
  properties: RGMapProperty[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose?: () => void;
  className?: string;
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
  blockNumber, properties, selectedId, onSelect, onClose, className,
}: Props) {
  const ordered = useMemo(() => [...properties].sort(comparePropertyOrder), [properties]);
  const enriched = useMemo(() => ordered.map((p) => {
    // Rótulo do pin = número REAL do imóvel (`p.number`), a mesma numeração
    // exibida no boletim/PDF/painel. Não é rank de posição no array.
    // Imóveis com mesmo número (complemento/anexo) mostram o número igual,
    // exatamente como no boletim impresso.
    const label = String(p.number ?? "—");
    return { p, label };
  }), [ordered]);

  const missingGeo = useMemo(
    () => enriched.filter((e) => e.p.latitude == null || e.p.longitude == null),
    [enriched],
  );

  const points: NumberedPoint[] = useMemo(() => enriched
    .filter((e) => e.p.latitude != null && e.p.longitude != null)
    .map(({ p, label }) => {
      const acc = p.accuracy != null ? `${Math.round(p.accuracy)} m` : "—";
      const addr = [p.street_name, p.side ? `Lado ${p.side}` : null].filter(Boolean).join(" · ");
      const popup = `
        <div style="font-family:system-ui;font-size:12px;min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#2563eb;color:#fff;font-weight:800;font-size:11px">${escapeHtml(label)}</span>
            <b style="font-size:13px">Nº ${escapeHtml(String(p.number ?? "—"))}${p.complement ? " · " + escapeHtml(p.complement) : ""}</b>
          </div>
          <div style="color:#475569;margin-bottom:6px">${escapeHtml(addr || "—")}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;color:#334155">
            ${p.sequence != null ? `<span style="color:#64748b">Sequência</span><b>${p.sequence}</b>` : ""}
            <span style="color:#64748b">Latitude</span><b>${fmtCoord(p.latitude)}</b>
            <span style="color:#64748b">Longitude</span><b>${fmtCoord(p.longitude)}</b>
            <span style="color:#64748b">Precisão GPS</span><b>${acc}</b>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <a href="https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;flex:1;justify-content:center;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:600;text-decoration:none;white-space:nowrap">
              📍 Ver no Google Maps
            </a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;flex:1;justify-content:center;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:600;text-decoration:none;white-space:nowrap">
              🧭 Navegar até aqui
            </a>
          </div>
        </div>`;
      return {
        id: p.id,
        lat: p.latitude as number,
        lng: p.longitude as number,
        label, color: "#2563eb", popupHtml: popup,
        tooltip: `Nº ${p.number ?? "—"}${p.complement ? " · " + p.complement : ""}`,
      };
    }), [enriched]);

  const geoCount = points.length;

  // Linha-guia: ordem CRONOLÓGICA de georreferenciamento (`geocoded_at`), que
  // reproduz o perímetro real caminhado no quarteirão — diferente da ordem por
  // número (comparePropertyOrder), que ziguezagueia entre lados da rua.
  // Sem `geocoded_at` → vai para o fim, com `id` como desempate estável.
  const chronological = useMemo(() => {
    const byId = new Map(enriched.map((e) => [e.p.id, e.p]));
    return [...points].sort((a, b) => {
      const pa = byId.get(a.id);
      const pb = byId.get(b.id);
      const ta = pa?.geocoded_at ? Date.parse(pa.geocoded_at) : NaN;
      const tb = pb?.geocoded_at ? Date.parse(pb.geocoded_at) : NaN;
      const va = Number.isFinite(ta) ? ta : Number.MAX_SAFE_INTEGER;
      const vb = Number.isFinite(tb) ? tb : Number.MAX_SAFE_INTEGER;
      if (va !== vb) return va - vb;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [points, enriched]);

  const routePoints = useMemo(
    () => chronological.map((p) => ({ lat: p.lat, lng: p.lng })),
    [chronological],
  );
  const routeLatLngs = useMemo(
    () => chronological.map((p) => [p.lat, p.lng] as [number, number]),
    [chronological],
  );

  // Instância do mapa (para centralizar na posição do agente sob demanda).
  const [mapInst, setMapInst] = useState<L.Map | null>(null);


  // Auto-enquadra o mapa nos imóveis do quarteirão assim que ele carrega ou
  // quando a lista de pontos georreferenciados muda — sem isso o mapa abria
  // centralizado num ponto genérico e era preciso descobrir manualmente o
  // botão "Centralizar quarteirão" antes de conseguir ver a rua de perto.
  // Opções memoizadas: useFitBounds usa os valores como dependências de efeito
  // por referência — um objeto/array novo a cada render faria o mapa voltar a
  // se re-enquadrar (perdendo zoom/pan manual do usuário) a cada atualização
  // de GPS ou outro estado não relacionado aos pontos.
  const fitBoundsOpts = useMemo(() => ({ maxZoom: 18, padding: [32, 32] as [number, number] }), []);
  useFitBounds(mapInst, routeLatLngs, fitBoundsOpts);

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
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
        setUserPos(p);
      },
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

  const handleSelectFromList = useCallback((id: string) => {
    onSelect(id);
    // Imóveis sem GPS não têm marcador no mapa (o layer filtra por lat/lng
    // válidos), então clicar neles aqui só destacava a linha na lista — sem
    // nenhum feedback de que "o mapa não mexeu de propósito". Isso é
    // exatamente o bug relatado: clicar no número do imóvel parece não fazer
    // nada quando o imóvel ainda não foi georreferenciado.
    const clicked = enriched.find((e) => e.p.id === id)?.p;
    if (clicked && (clicked.latitude == null || clicked.longitude == null)) {
      toast.info(`Imóvel Nº ${clicked.number ?? "—"} ainda não tem localização GPS registrada.`);
    }
  }, [onSelect, enriched]);

  const handleSelectFromMap = useCallback((id: string) => {
    onSelect(id);
  }, [onSelect]);


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

        <div className="grid grid-cols-2 gap-1.5 text-center">
          <Kpi label="Imóveis" value={ordered.length} />
          <Kpi label="Com coordenadas" value={points.length} />
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
          Imóveis ({geoCount}/{ordered.length} no mapa)
        </div>

        <div ref={listRef} className="mt-1 flex-1 min-h-0 overflow-auto rounded-md border border-slate-100">
          {enriched.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">Sem imóveis.</div>
          ) : (
            <ul>
              {enriched.map(({ p, label }) => {
                const isSel = p.id === selectedId;
                const hasGeo = p.latitude != null && p.longitude != null;
                return (
                  <li key={p.id} data-prop-id={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectFromList(p.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs border-b border-slate-100 transition",
                        isSel ? "bg-blue-50" : "hover:bg-slate-50",
                        !hasGeo && "opacity-70",
                      )}
                    >
                      <span
                        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-black text-white shrink-0"
                        style={{ background: "#2563eb" }}
                        title={hasGeo ? "Georreferenciado" : "Sem coordenadas"}
                      >
                        {label}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate text-slate-800">
                          Nº {p.number}{p.complement ? ` · ${p.complement}` : ""}
                        </span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {p.street_name || "Endereço não informado"}
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

        {missingGeo.length > 0 && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-800">
              Imóveis sem georreferenciamento ({missingGeo.length})
            </div>
            <ul className="mt-1 max-h-28 overflow-auto">
              {missingGeo.map(({ p }) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectFromList(p.id)}
                    className="w-full text-left text-[11px] px-1 py-0.5 rounded hover:bg-amber-100 text-amber-900 truncate"
                  >
                    Nº {p.number} — {p.street_name || "—"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <div className="min-h-0">
        <SharedMap
          height="78vh"
          isEmpty={ordered.length === 0 || geoCount === 0}
          emptyVariant={ordered.length === 0 ? "no-data" : "no-geo"}
          legend="none"
          onReady={setMapInst}
        >
          {routePoints.length > 1 && (
            <SharedRouteLayer
              points={routePoints}
              color="#94a3b8"
              weight={2}
              opacity={0.75}
              dashArray="4 7"
            />
          )}
          {/* Sem agrupamento: cada imóvel é desenhado individualmente, para que
              a sequência numérica nunca seja escondida numa bolha de cluster. */}
          <SharedNumberedMarkerLayer
            points={points}
            selectedId={selectedId}
            cluster={false}
            onClick={handleSelectFromMap}
          />

          {gpsOn && userPos && (
            <SharedUserLocationLayer
              lat={userPos.lat}
              lng={userPos.lng}
              accuracy={userPos.accuracy}
            />
          )}
          <SharedMapControls
            fitPoints={points.map((p) => [p.lat, p.lng] as [number, number])}
            onRefresh={() => {
              if (mapInst) mapInst.invalidateSize();
            }}
          />
        </SharedMap>
        <MapLegend />
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-1 py-1.5 text-slate-700">
      <div className="text-sm font-black leading-none">{value}</div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</div>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
        Imóvel georreferenciado
      </span>
      <span>Imóveis sem coordenadas aparecem na lista ao lado.</span>
    </div>
  );
}
