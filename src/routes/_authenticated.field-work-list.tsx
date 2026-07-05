import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { blockManagersGuard } from "@/lib/role-guards";
import { resolveCycleWeek, getEpiWeek } from "@/lib/cycle-week";
import { useState, useEffect } from "react";
import { 
  Search, 
  MapPin, 
  ChevronRight, 
  Filter,
  Home,
  Store,
  Warehouse,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Building,
  TrendingUp,
  Target,
  FileText,
  ClipboardList,
  Layers,
  LayoutDashboard,
  History as HistoryIcon,
  BarChart3,
  Droplets
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { updateWhereOffline } from "@/lib/offline/repos";
import { DigitalBulletinTable } from "@/components/DigitalBulletinTable";
import { DailyWorkCloser } from "@/components/DailyWorkCloser";
import { LandscapeBulletinLayout } from "@/components/LandscapeBulletinLayout";
import { useOrientation } from "@/hooks/useOrientation";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";
import { translate } from "@/lib/translations";

export const Route = createFileRoute("/_authenticated/field-work-list")({
  beforeLoad: blockManagersGuard,
  validateSearch: (s: Record<string, unknown>) => ({
    restore: typeof s.restore === "string" ? s.restore : undefined,
    ts: typeof s.ts === "number" ? s.ts : typeof s.ts === "string" ? Number(s.ts) : undefined,
  }),
  component: FieldWorkListPage,
});

function FieldWorkListPage() {
  const search = Route.useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeSession, setActiveSession] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [indexSurvey, setIndexSurvey] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const navigate = useNavigate();
  const isLandscape = useOrientation();
  const [agent, setAgent] = useState<any>(null);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [activeWeek, setActiveWeek] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("agent");

  useEffect(() => {
    if (search.restore) {
      console.log("[SESSION_AUTO_REFRESH]", { restore: search.restore, ts: search.ts });
    }
    fetchSessionAndProperties(search.restore);
    fetchAgentAndPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.restore, search.ts]);

  const fetchAgentAndPeriod = async () => {
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) return;

      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (agentData) {
        setAgent(agentData);
        setIsLocked(agentData.work_status === 'work_completed');
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) setUserRole(profile.role);

      const { data: cycle } = await supabase
        .from("cycles")
        .select("*")
        .eq("status", "in_progress")
        .maybeSingle();
      if (cycle) {
        setActiveCycle(cycle);
        const week = await resolveCycleWeek(cycle.id, new Date());
        if (week) setActiveWeek(week);
        console.log("[CICLO]", { cycle_id: cycle.id, cycle_number: (cycle as any).number });
        console.log("[SEMANA_CICLO]", { week_id: week?.id ?? null, week_number: week?.number ?? null });
        const se = getEpiWeek(new Date());
        console.log("[SE]", { epi_week: se.week, epi_year: se.year });
      }
    } catch (e) { console.error(e); }
  };

  const fetchSessionAndProperties = async (preferSessionId?: string) => {
    setIsLoading(true);
    console.log("[SESSION_RESTORE_START]", { preferSessionId: preferSessionId ?? null });
    try {
      const { data: { user } } = await safeGetUser();
      if (!user) return;

      const { listRemoteOrCache } = await import("@/lib/offline/repos");
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;

      const sessions = await listRemoteOrCache<any>({
        name: "field_work_sessions",
        remote: () =>
          supabase
            .from("field_work_sessions")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "in_progress")
            .order("created_at", { ascending: false })
            .limit(5) as any,
        filter: (s) => s.user_id === user.id && s.status === "in_progress",
      });
      const sorted = [...(sessions || [])].sort((a: any, b: any) =>
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
      );
      const session =
        (preferSessionId && sorted.find((s: any) => s.id === preferSessionId)) ||
        sorted[0] ||
        null;

      if (session) {
        setActiveSession(session);
        console.log("[SESSION_RESTORE_SESSION]", {
          session_id: session.id,
          block_id: session.block_id ?? null,
          block_number: session.block_number,
          session_date: session.session_date,
          created_at: session.created_at,
        });

        // ─── RC-7: preservar ciclo original da jornada ─────────────
        // Enquanto a jornada estiver IN_PROGRESS, ignoramos o ciclo
        // atual do sistema. cycle_id / week_id / block_id da jornada
        // são a única fonte de verdade até o encerramento.
        let operationalCycleId: string | null = session.cycle_id ?? null;
        let currentSystemCycleId: string | null = null;
        if (online) {
          const { data: currentCycle } = await supabase
            .from("cycles")
            .select("id, number")
            .eq("status", "in_progress")
            .maybeSingle();
          currentSystemCycleId = currentCycle?.id ?? null;
          console.log("[SESSION_CURRENT_CYCLE]", {
            system_cycle_id: currentSystemCycleId,
            system_cycle_number: (currentCycle as any)?.number ?? null,
          });
        }

        if (operationalCycleId) {
          const kept = !!currentSystemCycleId && currentSystemCycleId !== operationalCycleId;
          console.log("[SESSION_RESTORE_CYCLE]", {
            session_cycle_id: operationalCycleId,
            system_cycle_id: currentSystemCycleId,
            decision: kept ? "keep_session_cycle" : "same_cycle",
          });
          if (kept) {
            console.log("[SESSION_KEEP_ORIGINAL_CYCLE]", {
              session_cycle_id: operationalCycleId,
              system_cycle_id: currentSystemCycleId,
              message: "Jornada mantida no ciclo original até encerramento.",
            });
          }
          // Sobrescreve ciclo/semana exibidos usando o da jornada.
          const { data: sessionCycle } = await supabase
            .from("cycles")
            .select("*")
            .eq("id", operationalCycleId)
            .maybeSingle();
          if (sessionCycle) {
            setActiveCycle(sessionCycle);
            const wk = session.week_id
              ? (await supabase.from("weeks").select("*").eq("id", session.week_id).maybeSingle()).data
              : await resolveCycleWeek(operationalCycleId, new Date(session.created_at || Date.now()));
            if (wk) setActiveWeek(wk as any);
          }
        } else if (!operationalCycleId && currentSystemCycleId) {
          operationalCycleId = currentSystemCycleId;
        }

        console.log("[SESSION_RESTORE_BLOCK]", {
          block_id: session.block_id ?? null,
          block_number: session.block_number,
        });
        console.log("[BLOCK_RESTORE]", {
          session_id: session.id,
          session_block_number: session.block_number,
          session_block_id: session.block_id ?? null,
        });
        console.log("[BLOCK_SELECTED]", {
          selectedBlock: session.block_number,
          currentBlock: session.block_number,
          block_id: session.block_id ?? null,
        });

        // Restringe as propriedades ao agente atual: mesmo block_number pode existir
        // em múltiplos blocks (localidades/ruas diferentes). Filtrar por boletim_id
        // do próprio agente evita "puxar dados de outro quarteirão".
        const myBoletins = await listRemoteOrCache<any>({
          name: "boletins_rg",
          remote: () =>
            supabase.from("boletins_rg").select("id, agent_id").eq("agent_id", user.id) as any,
          filter: (b) => b.agent_id === user.id,
        });
        const myBoletimIds = (myBoletins ?? []).map((b: any) => b.id);
        console.log("[FIELD_SCOPE]", { boletim_count: myBoletimIds.length });
        console.log("[BLOCK_QUERY]", {
          query_block_number: session.block_number,
          query_block_id: session.block_id ?? null,
          filter_boletim_ids: myBoletimIds,
          online,
        });

        let propsRaw = await listRemoteOrCache<any>({
          name: "properties",
          remote: () =>
            (myBoletimIds.length
              ? supabase
                  .from("properties")
                  .select("*")
                  .eq("block_number", session.block_number)
                  .in("boletim_id", myBoletimIds)
                  .order("sequence", { ascending: true, nullsFirst: false })
              : Promise.resolve({ data: [] as any[], error: null })) as any,
          filter: (p) =>
            String(p.block_number) === String(session.block_number) &&
            myBoletimIds.includes(p.boletim_id),
        });
        const fwlSource = (propsRaw as any)?.source || "remote";
        console.log("[FIELD_BLOCK]", { block_number: session.block_number, block_id: session.block_id ?? null, online });
        console.log(fwlSource === "remote" ? "[FIELD_REMOTE]" : "[FIELD_CACHE]", { count: propsRaw?.length || 0 });

        // Fallback offline por block_id quando não houver match por block_number no cache
        if ((!propsRaw || propsRaw.length === 0)) {
          let blockIdGuess: string | null = session.block_id ?? null;
          if (!blockIdGuess && session.block_number) {
            const blocks = await listRemoteOrCache<any>({
              name: "blocks",
              remote: () => Promise.resolve({ data: [] as any[], error: null }) as any,
              filter: (bk) => String(bk.number) === String(session.block_number),
            });
            blockIdGuess = blocks?.[0]?.id ?? null;
          }
          if (blockIdGuess) {
            const byBlockId = await listRemoteOrCache<any>({
              name: "properties",
              remote: () => Promise.resolve({ data: [] as any[], error: null }) as any,
              filter: (p) => p.block_id === blockIdGuess,
            });
            if (byBlockId?.length) {
              propsRaw = byBlockId as any;
              console.log("[FIELD_CACHE]", { fallback: "block_id", block_id: blockIdGuess, count: byBlockId.length });
            }
          }
        }
        console.log("[FIELD_PROPERTIES]", { count: propsRaw?.length || 0, online });
        const _propsArr = (propsRaw as any[]) || [];
        console.log("[BLOCK_PROPERTIES]", {
          count: _propsArr.length,
          session_block_number: session.block_number,
          session_block_id: session.block_id ?? null,
          first: _propsArr[0]
            ? { id: _propsArr[0].id, number: _propsArr[0].number, block_number: _propsArr[0].block_number, block_id: _propsArr[0].block_id, boletim_id: _propsArr[0].boletim_id }
            : null,
          last: _propsArr.length
            ? { id: _propsArr[_propsArr.length - 1].id, number: _propsArr[_propsArr.length - 1].number, block_number: _propsArr[_propsArr.length - 1].block_number, block_id: _propsArr[_propsArr.length - 1].block_id, boletim_id: _propsArr[_propsArr.length - 1].boletim_id }
            : null,
          distinct_block_numbers: Array.from(new Set(_propsArr.map((p: any) => p.block_number))),
          distinct_block_ids: Array.from(new Set(_propsArr.map((p: any) => p.block_id))),
        });
        console.log("[BLOCK_FINAL_RENDER]", {
          session_id: session.id,
          rendered_block_number: session.block_number,
          rendered_block_id: session.block_id ?? null,
          property_count: _propsArr.length,
        });
        console.log("[SESSION_RESTORE_PROPERTIES]", {
          session_id: session.id,
          block_id: session.block_id ?? null,
          count: propsRaw?.length || 0,
        });
        console.log("[RESTORE_PROPERTIES]", {
          quantity: propsRaw?.length || 0,
          block_id: session.block_id ?? null,
          block_number: session.block_number ?? null,
          first10_property_ids: (propsRaw || []).slice(0, 10).map((p: any) => ({
            id: p.id,
            id_type: typeof p.id,
            number: p.number,
          })),
        });


        const seqKey = (s: any) => {
          if (s === null || s === undefined || s === "") return Number.MAX_SAFE_INTEGER;
          const v = Number(s);
          return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
        };
        const numKey = (n: any) => {
          const v = parseInt(String(n ?? "").replace(/\D/g, ""), 10);
          return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
        };
        const norm = (s: any) => String(s ?? "").trim().toLowerCase();
        const props = [...(propsRaw || [])].sort((a: any, b: any) => {
          const sa = seqKey(a.sequence); const sb = seqKey(b.sequence);
          if (sa !== sb) return sa - sb;
          const ra = norm(a.street_name); const rb = norm(b.street_name);
          if (ra !== rb) return ra < rb ? -1 : 1;
          const na = numKey(a.number); const nb = numKey(b.number);
          if (na !== nb) return na - nb;
          const ca = norm(a.complement); const cb = norm(b.complement);
          if (ca !== cb) return ca < cb ? -1 : 1;
          return String(a.id).localeCompare(String(b.id));
        });

        if (props) {
          const propertyIds = props.map((p: any) => p.id).filter(Boolean);
          const propertyIdSet = new Set(propertyIds);

          // ─── Carregar visitas da JORNADA (RC-6) ─────────────────────
          // Escopo ESTRITO: field_work_session_id === session.id
          // Sem heurísticas por data/propriedade/block_number.
          const inScope = (v: any) => !!v && v.field_work_session_id === session.id;

          const visitColumns = `
            id,
            status,
            activity_type,
            has_focus,
            treatment_applied,
            treatment_amount,
            larvicide_unit,
            treated_deposits,
            elimination_done,
            elimination_amount,
            visit_date,
            agent_id,
            cycle_id,
            property_id,
            field_work_session_id,
            block_id,
            visit_deposits (
              id,
              is_positive,
              is_treated
            )
          `;

          let blockCycleVisits: any[] = [];
          try {
            const visitsAll = await listRemoteOrCache<any>({
              name: "visits",
              remote: () =>
                supabase
                  .from("visits")
                  .select(visitColumns)
                  .eq("field_work_session_id", session.id)
                  .order("visit_date", { ascending: false }) as any,
              filter: inScope,
            });
            blockCycleVisits = (visitsAll || []).filter(inScope);
          } catch (e) {
            console.warn("[SESSION_RESTORE_VISITS] fallback empty:", e);
          }

          console.log("[SESSION_RESTORE_VISITS]", {
            session_id: session.id,
            count: blockCycleVisits.length,
            source: online ? "remote+cache" : "cache",
          });


          console.log("[RESTORE_VISITS]", {
            quantity: blockCycleVisits.length,
            first10: blockCycleVisits.slice(0, 10).map((v: any) => ({
              id: v.id,
              property_id: v.property_id,
              property_id_type: typeof v.property_id,
              field_work_session_id: v.field_work_session_id,
              cycle_id: v.cycle_id,
              block_id: v.block_id,
            })),
          });

          // RC-8 audit: per-visit match against loaded properties
          const propIndex = new Map<string, any>();
          props.forEach((p: any) => propIndex.set(String(p.id), p));
          let matches = 0;
          let nomatches = 0;
          const mismatchExamples: Array<{ visit_property_id: any; visit_id: string; sample_property_ids: string[] }> = [];
          blockCycleVisits.forEach((v: any) => {
            const key = String(v.property_id);
            const found = propIndex.has(key);
            if (found) {
              matches++;
              console.log("[RESTORE_MATCH]", {
                visit_id: v.id,
                visit_property_id: v.property_id,
                property_id: key,
                result: "MATCH",
              });
            } else {
              nomatches++;
              console.log("[RESTORE_MATCH]", {
                visit_id: v.id,
                visit_property_id: v.property_id,
                visit_property_id_type: typeof v.property_id,
                result: "NO_MATCH",
              });
              if (mismatchExamples.length < 10) {
                mismatchExamples.push({
                  visit_property_id: v.property_id,
                  visit_id: v.id,
                  sample_property_ids: props.slice(0, 5).map((p: any) => p.id),
                });
              }
            }
          });
          console.log("[RESTORE_MATCH_TOTALS]", { MATCHS: matches, NO_MATCHS: nomatches });
          if (blockCycleVisits.length > 0 && matches === 0) {
            console.warn("[RESTORE_MISMATCH_SIDE_BY_SIDE]", mismatchExamples);
            console.warn("[RESTORE_TYPE_CHECK]", {
              visit_sample: blockCycleVisits.slice(0, 5).map((v: any) => ({
                property_id: v.property_id,
                type: typeof v.property_id,
                length: String(v.property_id ?? "").length,
              })),
              property_sample: props.slice(0, 5).map((p: any) => ({
                id: p.id,
                type: typeof p.id,
                length: String(p.id ?? "").length,
              })),
            });
          }

          const visitsByProperty = new Map<string, any[]>();
          blockCycleVisits.forEach((visit: any) => {
            const list = visitsByProperty.get(visit.property_id) || [];
            list.push(visit);
            visitsByProperty.set(visit.property_id, list);
          });


          const normalizedProps = props.map(p => {
            const propertyVisits = visitsByProperty.get(p.id) || [];
            const latestVisit = propertyVisits.length > 0
              ? [...propertyVisits].sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())[0]
              : null;

            return {
              ...p,
              status: latestVisit?.status || "not_visited",
              has_focus: latestVisit?.has_focus || latestVisit?.visit_deposits?.some((d: any) => d.is_positive) || false,
              treatment_applied: latestVisit?.treatment_applied || latestVisit?.visit_deposits?.some((d: any) => d.is_treated) || false,
              is_pending: latestVisit?.activity_type === 'pending' || latestVisit?.status === 'closed' || latestVisit?.status === 'refused',
              latest_visit: latestVisit
            };
          });

          const markedCount = normalizedProps.filter((p: any) => p.latest_visit).length;
          console.log("[SESSION_RESTORE_MARKED]", {
            session_id: session.id,
            properties_loaded: normalizedProps.length,
            properties_marked: markedCount,
            visits_found: blockCycleVisits.length,
          });

          normalizedProps.sort((a: any, b: any) => {
            const na = parseInt(a.number, 10);
            const nb = parseInt(b.number, 10);
            if (isNaN(na) && isNaN(nb)) return 0;
            if (isNaN(na)) return 1;
            if (isNaN(nb)) return -1;
            return na - nb;
          });
          setProperties(normalizedProps);
          console.log("[SESSION_PROPERTIES_READY]", { count: normalizedProps.length });
          console.log("[SESSION_VISITS_READY]", { count: blockCycleVisits.length, marked: markedCount });
          console.log("[SESSION_STATE_UPDATED]", { session_id: session.id, block_number: session.block_number });
          console.log("[SESSION_RESTORE_FINISHED]", { session_id: session.id });

          console.log("[SESSION_RESTORE_FINISH]", {
            session_id: session.id,
            block_id: session.block_id ?? null,
            block_number: session.block_number,
            properties_loaded: normalizedProps.length,
            visits_found: blockCycleVisits.length,
            properties_marked: markedCount,
          });
          console.log("[RESTORE_RESULT]", {
            properties_loaded: normalizedProps.length,
            properties_marked: markedCount,
            visits_loaded: blockCycleVisits.length,
            matches_found: matches,
            no_matches: nomatches,
            percentage: normalizedProps.length > 0 ? Math.round((markedCount / normalizedProps.length) * 100) : 0,
          });

          console.log("[RC5_SESSION_RESTORE_OK]");
          console.log("[RC7_CYCLE_CONTINUITY_OK]", {
            session_id: session.id,
            session_cycle_id: session.cycle_id ?? null,
          });
        }
      } else {
        console.log("[SESSION_RESTORE_FINISH]", { session_id: null, reason: "no_active_session" });
      }
    } catch (error) {
      console.error("[SESSION_RESTORE_ERROR]", error);
    } finally {
      setIsLoading(false);
      console.log("[SESSION_RENDER_READY]");
    }
  };

  const filteredProperties = properties.filter(p => {
    const matchesSearch = (p.number || "").includes(searchQuery) || (p.street_name?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    if (filter === "all") return matchesSearch;
    if (filter === "completed") return matchesSearch && ["visited", "closed", "refused", "abandoned"].includes(p.status);
    if (filter === "pending") return matchesSearch && (p.status === "not_visited" || p.status === "closed" || p.status === "refused");
    if (filter === "focus") return matchesSearch && p.has_focus;
    if (filter === "survey") return matchesSearch && p.latest_visit?.activity_type === 'infestation_survey';
    return matchesSearch;
  });

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Add Summary Section
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("Resumo Operacional Diário", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Agente: ${agent?.name || "Agente"}`, 14, 30);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 35);
    doc.text(`Quarteirão: ${activeSession?.block_number} | Ciclo: ${activeCycle?.number}`, 14, 40);

    // Summary Box
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 45, 182, 35, 3, 3, "FD");

    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Imóveis Trabalhados: ${workedCount}`, 20, 55);
    doc.text(`Imóveis Visitados: ${properties.filter(p => p.status === "visited").length}`, 20, 60);
    doc.text(`Imóveis Fechados: ${closedCount}`, 20, 65);
    doc.text(`Imóveis Recusados: ${refusedCount}`, 20, 70);
    
    doc.text(`Depósitos Tratados: ${treatedDepositsCount}`, 85, 55);
    doc.text(`Depósitos Eliminados: ${eliminationCount}`, 85, 62);
    doc.text(`Focos Positivos: ${focusCount}`, 85, 69);

    doc.text(`Larvicida Utilizado: ${larvicideUsed}g/ml`, 145, 55);
    doc.text(`Cobertura: ${progressPercent}%`, 145, 62);

    // Detailed Table
    doc.setFontSize(16);
    doc.text("Boletim Diário de Visitas", 14, 95);

    const tableData = properties.map(p => {
      const treatmentInfo = p.latest_visit?.treatment_applied 
        ? `${p.latest_visit.treatment_amount}${p.latest_visit.larvicide_unit === 'gramas' ? 'g' : p.latest_visit.larvicide_unit === 'ml' ? 'ml' : ' un'}`
        : "Não";
      
      return [
        p.number,
        translate(p.type) || "Res.",
        translate(p.status) || translate("not_visited"),
        treatmentInfo,
        p.has_focus ? "Sim" : "Não",
        p.is_pending ? "Sim" : "Não",
        p.observation || ""
      ];
    });

    autoTable(doc, {
      startY: 100,
      head: [['Nº', 'Tipo', 'Situação', 'Trat.', 'Foco', 'Pend.', 'Obs.']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 20 },
        2: { cellWidth: 25 },
        3: { cellWidth: 20 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
      }
    });

    doc.save(`boletim-diario-${activeSession?.block_number}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Boletim e Resumo Operacional gerados com sucesso!");
  };

  const workedCount = properties.filter(p => ["visited", "closed", "refused", "abandoned"].includes(p.status)).length;
  const closedCount = properties.filter(p => p.status === "closed").length;
  const refusedCount = properties.filter(p => p.status === "refused").length;
  const focusCount = properties.filter(p => p.has_focus).length;
  const treatedCount = properties.filter(p => p.treatment_applied).length;
  const treatedDepositsCount = properties.reduce((acc, p) => acc + (p.latest_visit?.treated_deposits || 0), 0);
  const larvicideUsed = properties.reduce((acc, p) => acc + (Number(p.latest_visit?.treatment_amount) || 0), 0);
  const eliminationCount = properties.reduce((acc, p) => acc + (Number(p.latest_visit?.elimination_amount) || 0), 0);
  const progressPercent = properties.length > 0 ? Math.round((workedCount / properties.length) * 100) : 0;

  return (
    <LandscapeBulletinLayout
      isLandscape={isLandscape}
      title="Boletim Digital"
      subtitle={`Quarteirão ${activeSession?.block_number || "--"}`}
      agentInfo={{
        municipality: agent?.municipality || "Município",
        name: agent?.name || "Agente",
        registrationId: agent?.registration_id || "MAT-0000",
        cycle: activeCycle?.number || "01/26",
        week: activeWeek?.number?.toString() || "1",
        block: activeSession?.block_number || "--",
        street: ""
      }}
      stats={{
        worked: workedCount,
        total: properties.length,
        closed: closedCount,
        refused: refusedCount,
        focus: focusCount,
        treated: treatedCount,
        treatedDeposits: treatedDepositsCount,
        larvicideUsed: larvicideUsed,
        eliminated: eliminationCount,
        progress: progressPercent
      }}
      sidebarFooter={
        <div className="mt-auto">
          <DailyWorkCloser 
            stats={{
              worked: workedCount,
              closed: closedCount,
              refused: refusedCount,
              eliminated: eliminationCount,
              treated: treatedCount,
              focus: focusCount,
              pending: properties.filter(p => p.status === 'closed' || p.status === 'refused').length,
              treatedDeposits: treatedDepositsCount,
              larvicideUsed: larvicideUsed,
              progress: progressPercent
            }}
            onGeneratePDF={generatePDF}
            isLocked={isLocked}
            userRole={userRole}
            onReopen={async () => {
              try {
                const { data: { user } } = await safeGetUser();
                if (!user) return;
                await updateWhereOffline("agents", { profile_id: user.id }, { work_status: "in_work" });
                setIsLocked(false);
                toast.success("Boletim reaberto com sucesso!");
              } catch (e) {
                toast.error("Erro ao reabrir boletim.");
              }
            }}
          />
        </div>
      }
    >
      <div className={cn("space-y-6 pb-[200px] animate-in fade-in slide-in-from-bottom-4 duration-700", isLandscape && "pb-0 h-full flex flex-col min-h-0", "lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:pb-0 lg:h-[calc(100vh-140px)]")}>
        {!isLandscape && (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 md:gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/field-work' })} className="rounded-full active:scale-95 bg-white shadow-sm shrink-0">
                  <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
                </Button>
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                    Boletim Digital
                  </h2>
                  <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 truncate max-w-[200px] md:max-w-none">
                    Quarteirão {activeSession?.block_number}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={generatePDF}
                className="w-full sm:w-auto rounded-xl md:rounded-2xl border-none bg-white shadow-md hover:shadow-lg transition-all font-black text-[10px] uppercase tracking-widest gap-2 h-10 md:h-12"
              >
                <FileText className="h-4 w-4 text-red-500" />
                Gerar PDF
              </Button>
            </div>

            <div className="relative group mb-2">
              <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors z-10" />
              <Input 
                placeholder="Buscar imóvel por número ou rua..." 
                className="pl-12 h-14 rounded-2xl border-none bg-white shadow-xl text-base font-bold focus-visible:ring-blue-500/20 relative z-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              <Card className="border-none shadow-xl bg-emerald-600 text-white rounded-[2rem] overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Target className="h-16 w-16" />
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100 mb-1">Quarteirão</p>
                      <h3 className="text-2xl font-black tracking-tighter">{progressPercent}%</h3>
                    </div>
                    <p className="text-[10px] font-bold text-emerald-100">{workedCount} de {properties.length} imóveis</p>
                  </div>
                  <Progress value={progressPercent} className="h-2.5 bg-white/20" />
                </CardContent>
              </Card>

              <Card className="border-none shadow-xl bg-blue-600 text-white rounded-[2rem] overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Layers className="h-16 w-16" />
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-100 mb-1">Rua/Logradouro</p>
                      <h3 className="text-2xl font-black tracking-tighter">64%</h3>
                    </div>
                    <p className="text-[10px] font-bold text-blue-100">18 de 28 imóveis</p>
                  </div>
                  <Progress value={64} className="h-2.5 bg-white/20" />
                </CardContent>
              </Card>

              <Card className="border-none shadow-xl bg-purple-600 text-white rounded-[2rem] overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <LayoutDashboard className="h-16 w-16" />
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-100 mb-1">Ciclo Atual</p>
                      <h3 className="text-2xl font-black tracking-tighter">42%</h3>
                    </div>
                    <p className="text-[10px] font-bold text-purple-100">842 de 2000 imóveis</p>
                  </div>
                  <Progress value={42} className="h-2.5 bg-white/20" />
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="flex-1"></div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                className={cn(
                  "h-14 w-14 rounded-2xl border-none shadow-lg transition-all",
                  indexSurvey ? "bg-amber-500 text-white" : "bg-white text-slate-400"
                )}
                onClick={() => setIndexSurvey(!indexSurvey)}
              >
                <TrendingUp className="h-6 w-6" />
              </Button>
              {isLandscape && (
                <Button 
                  variant="outline" 
                  onClick={generatePDF}
                  className="h-14 px-6 rounded-2xl border-none bg-white shadow-lg transition-all font-black text-[10px] uppercase tracking-widest gap-2"
                >
                  <FileText className="h-4 w-4 text-red-500" />
                  PDF
                </Button>
              )}
            </div>
          </div>

          <Tabs defaultValue="all" className="w-full" onValueChange={setFilter}>
            <TabsList className="w-full h-14 bg-white/50 backdrop-blur-sm shadow-inner border border-slate-100 rounded-[1.5rem] p-1.5 overflow-x-auto overflow-y-hidden no-scrollbar">
              <TabsTrigger value="all" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full">Todos</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full px-4">Pendências</TabsTrigger>
              <TabsTrigger value="completed" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full px-4">Visitados</TabsTrigger>
              <TabsTrigger value="focus" className="flex-1 rounded-xl font-black text-[9px] uppercase tracking-widest data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full px-4">Focos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className={cn("space-y-4", "flex-1 min-h-0 lg:overflow-hidden")}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Boletim...</p>
            </div>
          ) : filteredProperties.length > 0 ? (
            <div className={cn("h-full lg:min-h-0 lg:overflow-hidden flex flex-col")}>
              <DigitalBulletinTable 
                properties={filteredProperties} 
                indexSurvey={indexSurvey}
                onPropertyClick={(prop) => {
                  if (isLocked) {
                    toast.error("O boletim está encerrado. Reabra para fazer alterações.");
                    return;
                  }
                  setSelectedProperty(prop);
                  setIsModalOpen(true);
                }}
                onStatusUpdate={() => {}} 
              />
              <div className="fixed bottom-[100px] left-0 right-0 p-4 bg-gradient-to-t from-slate-50/95 via-slate-50/50 to-transparent z-40 lg:hidden pointer-events-none pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <div className="pointer-events-auto max-w-md mx-auto">
                  <DailyWorkCloser 
                    stats={{
                      worked: workedCount,
                      closed: closedCount,
                      refused: refusedCount,
                      eliminated: eliminationCount,
                      treated: treatedCount,
                      focus: focusCount,
                      pending: properties.filter(p => p.status === 'closed' || p.status === 'refused').length,
                      treatedDeposits: treatedDepositsCount,
                      larvicideUsed: larvicideUsed,
                      progress: progressPercent
                    }}
                    onGeneratePDF={generatePDF}
                    isLocked={isLocked}
                    userRole={userRole}
                    onReopen={async () => {
                      try {
                        const { data: { user } } = await safeGetUser();
                        if (!user) return;
                        await updateWhereOffline("agents", { profile_id: user.id }, { work_status: "in_work" });
                        setIsLocked(false);
                        toast.success("Boletim reaberto com sucesso!");
                      } catch (e) {
                        toast.error("Erro ao reabrir boletim.");
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Building className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Nenhum imóvel encontrado</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Verifique os filtros ou busque outro número</p>
            </div>
          )}
        </div>
        
        {/* Desktop Sidebar Summary */}
        <div className="hidden lg:flex flex-col gap-6 overflow-y-auto no-scrollbar pb-6 pr-2">
          <Card className="border-none shadow-xl bg-slate-900 text-white rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-blue-500 flex items-center justify-center font-black">
                  {agent?.name?.substring(0, 1) || "A"}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{agent?.municipality || "Município"}</p>
                  <h4 className="font-black tracking-tight text-sm">{agent?.name || "Agente"}</h4>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Matrícula</p>
                  <p className="text-[10px] font-bold">{agent?.registration_id || "MAT-0000"}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Data</p>
                  <p className="text-[10px] font-bold">{new Date().toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-emerald-600 text-white rounded-[2rem] overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Target className="h-16 w-16" />
            </div>
            <CardContent className="p-6">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100 mb-1">Quarteirão {activeSession?.block_number}</p>
                  <h3 className="text-2xl font-black tracking-tighter">{progressPercent}%</h3>
                </div>
                <p className="text-[10px] font-bold text-emerald-100">{workedCount} de {properties.length} imóveis</p>
              </div>
              <Progress value={progressPercent} className="h-2.5 bg-white/20" />
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-blue-600 text-white rounded-[2rem] overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Layers className="h-16 w-16" />
            </div>
            <CardContent className="p-6">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-100 mb-1">Rua/Logradouro</p>
                  <h3 className="text-2xl font-black tracking-tighter">64%</h3>
                </div>
                <p className="text-[10px] font-bold text-blue-100">18 de 28 imóveis</p>
              </div>
              <Progress value={64} className="h-2.5 bg-white/20" />
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-purple-600 text-white rounded-[2rem] overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <LayoutDashboard className="h-16 w-16" />
            </div>
            <CardContent className="p-6">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-100 mb-1">Ciclo Atual</p>
                  <h3 className="text-2xl font-black tracking-tighter">42%</h3>
                </div>
                <p className="text-[10px] font-bold text-purple-100">842 de 2000 imóveis</p>
              </div>
              <Progress value={42} className="h-2.5 bg-white/20" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: translate("worked"), val: workedCount, color: "emerald", icon: CheckCircle2 },
              { label: translate("CLOSED"), val: closedCount, color: "yellow", icon: XCircle },
              { label: translate("REFUSED"), val: refusedCount, color: "red", icon: AlertCircle },
              { label: "Focos (+)", val: focusCount, color: "red", icon: BarChart3, highlight: true },
              { label: translate("TREATED"), val: treatedDepositsCount, color: "blue", icon: Layers },
              { label: "Larvicida (g/ml)", val: larvicideUsed, color: "cyan", icon: Droplets }
            ].map((s, i) => (
              <div key={i} className="bg-white p-4 rounded-3xl shadow-md border border-slate-100">
                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center mb-2", s.color === "emerald" ? "bg-emerald-100" : s.color === "yellow" ? "bg-yellow-100" : s.color === "red" ? "bg-red-100" : s.color === "blue" ? "bg-blue-100" : "bg-cyan-100")}>
                  <s.icon className={cn("h-4 w-4", s.highlight ? "text-white bg-red-500 p-0.5 rounded" : s.color === "emerald" ? "text-emerald-600" : s.color === "yellow" ? "text-yellow-600" : s.color === "red" ? "text-red-600" : s.color === "blue" ? "text-blue-600" : "text-cyan-600")} />
                </div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                <p className={cn("text-lg font-black text-slate-900", s.highlight && "text-red-600")}>{s.val}</p>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <DailyWorkCloser 
              stats={{
                worked: workedCount,
                closed: closedCount,
                refused: refusedCount,
                eliminated: eliminationCount,
                treated: treatedCount,
                focus: focusCount,
                pending: properties.filter(p => p.status === 'closed' || p.status === 'refused').length,
                treatedDeposits: treatedDepositsCount,
                larvicideUsed: larvicideUsed,
                progress: progressPercent
              }}
              onGeneratePDF={generatePDF}
              isLocked={isLocked}
              userRole={userRole}
              onReopen={async () => {
                try {
                  const { data: { user } } = await safeGetUser();
                  if (!user) return;
                  await updateWhereOffline("agents", { profile_id: user.id }, { work_status: "in_work" });
                  setIsLocked(false);
                  toast.success("Boletim reaberto com sucesso!");
                } catch (e) {
                  toast.error("Erro ao reabrir boletim.");
                }
              }}
            />
          </div>
        </div>

      </div>


      

      
      
      
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="bg-slate-900 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <HistoryIcon className="h-24 w-24" />
            </div>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-2xl bg-blue-500 flex items-center justify-center font-black text-xl">
                  {selectedProperty?.number}
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tighter">Detalhes do Imóvel</DialogTitle>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Histórico e Operação</p>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          <ScrollArea className="max-h-[60vh] p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Imóvel</p>
                  <p className="font-bold text-slate-800 uppercase text-xs">{translate(selectedProperty?.type)}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Atual</p>
                  <p className="font-bold text-slate-800 uppercase text-xs">{translate(selectedProperty?.status)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <HistoryIcon className="h-3 w-3 text-blue-500" /> Histórico de Visitas
                </h4>
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-2xl border border-slate-50 bg-slate-50/30">
                      <div className="h-8 w-8 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Visita Normal</p>
                        <p className="text-[10px] text-slate-500">12/05/2026 • 14:30</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Button 
                  className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20"
                  onClick={() => {
                    if (isLocked) {
                      toast.error("Boletim encerrado.");
                      return;
                    }
                    setIsModalOpen(false);
                    navigate({ to: `/property/${selectedProperty?.id}` });
                  }}
                  disabled={isLocked}
                >
                  Registrar Nova Visita
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </LandscapeBulletinLayout>
  );
}
