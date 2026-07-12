/**
 * operational-block-status.ts
 *
 * Fonte única para o cálculo do estado operacional de um quarteirão em uma
 * Data da Produção. TODOS os módulos (Trabalho, OperationalPanel, Dashboard,
 * Encerramento, Minhas Jornadas, Relatórios, Boletins, PDFs) devem usar
 * `getOperationalBlockStatus` e nunca recalcular manualmente.
 *
 * Regras de status:
 *   CONCLUIDO      → total > 0 && pending === 0
 *   EM_ANDAMENTO   → visitados+fechados+recusas > 0 && pending > 0
 *   PENDENTE       → nenhum imóvel trabalhado
 *
 * Logs:
 *   [BLOCK_STATUS_SOURCE]     — origem dos dados
 *   [BLOCK_STATUS_SHARED]     — módulo que reutilizou a função central
 *   [OPERATIONAL_STATUS_DIVERGENCE] — divergência entre módulos
 */

export type OperationalBlockStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";

export interface OperationalBlockStats {
  totalProperties: number;
  visitedProperties: number;
  closedProperties: number;
  refusedProperties: number;
  recoveredProperties: number;
  pendingProperties: number;
  completionPercentage: number;
  status: OperationalBlockStatus;
}

export interface VisitLike {
  property_id?: string | null;
  status?: string | null;
  visit_date?: string | null;
  is_recovery?: boolean | null;
}

export interface BlockStatusInput {
  /** IDs dos imóveis do quarteirão (fonte da verdade para o total). */
  propertyIds: string[];
  /** Visitas do agente na Data da Produção (uma ou mais por imóvel). */
  visits: VisitLike[];
  /** Fallback quando propertyIds está vazio (ex.: sessão sem carga). */
  fallbackTotal?: number;
}

/**
 * Calcula o estado operacional consolidado.
 * Considera apenas a ÚLTIMA visita por imóvel (evita dupla contagem em revisitas).
 */
export function getOperationalBlockStatus(input: BlockStatusInput): OperationalBlockStats {
  const { propertyIds, visits, fallbackTotal = 0 } = input;
  const total = propertyIds.length || fallbackTotal || 0;

  // Última visita por imóvel (ordenada por visit_date asc; a última prevalece).
  const lastByProp = new Map<string, VisitLike>();
  const sorted = [...visits].sort((a, b) =>
    String(a.visit_date || "").localeCompare(String(b.visit_date || "")),
  );
  for (const v of sorted) {
    if (v.property_id) lastByProp.set(v.property_id, v);
  }

  let visited = 0, closed = 0, refused = 0, recovered = 0;
  const scope = propertyIds.length ? propertyIds : Array.from(lastByProp.keys());
  for (const pid of scope) {
    const v = lastByProp.get(pid);
    if (!v) continue;
    if (v.is_recovery) recovered++;
    if (v.status === "visited") visited++;
    else if (v.status === "closed") closed++;
    else if (v.status === "refused") refused++;
  }

  const done = visited + closed + refused;
  const pending = Math.max(0, total - done);
  const status: OperationalBlockStatus =
    total > 0 && pending === 0 ? "CONCLUIDO" : done > 0 ? "EM_ANDAMENTO" : "PENDENTE";
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    totalProperties: total,
    visitedProperties: visited,
    closedProperties: closed,
    refusedProperties: refused,
    recoveredProperties: recovered,
    pendingProperties: pending,
    completionPercentage: pct,
    status,
  };
}

export interface BlockStatusAuditMeta {
  module: string;
  productionDate?: string | null;
  blockId?: string | null;
  blockNumber?: string | number | null;
  sessionId?: string | null;
}

/** Loga a origem/uso da função central. Chamar em CADA módulo que consome. */
export function logBlockStatusShared(meta: BlockStatusAuditMeta, stats: OperationalBlockStats) {
  console.log("[BLOCK_STATUS_SOURCE]", {
    module: meta.module,
    production_date: meta.productionDate ?? null,
    block_id: meta.blockId ?? null,
    block_number: meta.blockNumber ?? null,
    session_id: meta.sessionId ?? null,
    total: stats.totalProperties,
    visitados: stats.visitedProperties,
    fechados: stats.closedProperties,
    recusas: stats.refusedProperties,
    pendentes: stats.pendingProperties,
    status: stats.status,
  });
  console.log("[BLOCK_STATUS_SHARED]", { module: meta.module });
}

/**
 * Compara os totais que um módulo está apresentando com os totais canônicos
 * calculados por `getOperationalBlockStatus`. Emite divergências, nunca lança.
 */
export function assertOperationalStatusMatches(
  module: string,
  canonical: OperationalBlockStats,
  observed: Partial<Pick<OperationalBlockStats,
    "totalProperties" | "visitedProperties" | "closedProperties" | "pendingProperties">>,
) {
  const fields: Array<keyof OperationalBlockStats> = [
    "totalProperties", "visitedProperties", "closedProperties", "pendingProperties",
  ];
  for (const f of fields) {
    const exp = (canonical as any)[f];
    const got = (observed as any)[f];
    if (got === undefined || got === null) continue;
    if (Number(exp) !== Number(got)) {
      console.error("[OPERATIONAL_STATUS_DIVERGENCE]", {
        module, field: f, expected: exp, found: got,
      });
    }
  }
}
