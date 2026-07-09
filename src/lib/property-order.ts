/**
 * Ordenação operacional canônica de imóveis.
 *
 * Regra: ordenar EXCLUSIVAMENTE por número → sequência → complemento.
 * O tipo do imóvel (Residencial, Comercial, Terreno Baldio, Ponto Estratégico,
 * Outros) NUNCA pode influenciar a ordem — é apenas atributo de exibição.
 *
 * Esta função é a fonte única para:
 *   Painel Operacional · Próximo/Anterior · Lista · Busca · RG · PDF · Mapa · Resumo
 */

export interface PropertyOrderInput {
  id?: string | number | null;
  number?: string | number | null;
  sequence?: string | number | null;
  complement?: string | null;
  [k: string]: any;
}

function numKey(n: any): number {
  const v = parseInt(String(n ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
}

function seqKey(s: any): number {
  if (s === null || s === undefined || s === "") return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

function compKey(c: any): string {
  return String(c ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function comparePropertyOrder(a: PropertyOrderInput, b: PropertyOrderInput): number {
  const na = numKey(a.number);
  const nb = numKey(b.number);
  if (na !== nb) return na - nb;

  const sa = seqKey(a.sequence);
  const sb = seqKey(b.sequence);
  if (sa !== sb) return sa - sb;

  const ca = compKey(a.complement);
  const cb = compKey(b.complement);
  if (ca !== cb) {
    return ca.localeCompare(cb, "pt-BR", { numeric: true, sensitivity: "base" });
  }
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

export function sortPropertiesOperational<T extends PropertyOrderInput>(list: T[]): T[] {
  try {
    console.log("[PROPERTY_ORDER_INPUT]", list.map((p) => ({
      id: p.id, number: p.number, sequence: p.sequence, complement: p.complement,
    })));
  } catch {}
  const sorted = [...list].sort(comparePropertyOrder);
  try {
    console.log("[PROPERTY_ORDER_RESULT]", sorted.map((p) => ({
      id: p.id, number: p.number, sequence: p.sequence, complement: p.complement,
    })));
  } catch {}
  return sorted;
}
