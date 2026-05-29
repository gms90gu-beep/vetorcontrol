export const TRANSLATIONS: Record<string, string> = {
  // Property Types
  "RESIDENCE": "Residencial",
  "residential": "Residencial",
  "residence": "Residencial",
  "VACANT_LOT": "Terreno Baldio",
  "vacant_lot": "Terreno Baldio",
  "COMMERCIAL": "Comercial",
  "commerce": "Comercial",
  "STRATEGIC_POINT": "Ponto Estratégico",
  "strategic_point": "Ponto Estratégico",
  "OTHERS": "Outros",
  "others": "Outros",

  // Visit Statuses
  "OPEN": "Aberto",
  "open": "Aberto",
  "CLOSED": "Fechado",
  "closed": "Fechado",
  "NOT_VISITED": "Não Visitado",
  "not_visited": "Não Visitado",
  "VISITED": "Visitado",
  "visited": "Visitado",
  "REFUSED": "Recusado",
  "refused": "Recusado",
  "ABANDONED": "Abandonado",
  "abandoned": "Abandonado",
  "TREATED": "Tratado",
  "treated": "Tratado",
  "PENDING": "Pendente",
  "pending": "Pendente",
  "ACTIVE": "Ativo",
  "active": "Ativo",
  
  // Activity Types
  "routine": "Rotina",
  "infestation_survey": "L. Índice",
  
  // KPI Labels
  "worked": "Trabalhados"
};

/**
 * Translates a system key to its Portuguese display name.
 * Returns the original key if no translation is found.
 */
export function translate(key: string | null | undefined): string {
  if (!key) return "";
  const trimmedKey = key.trim();
  return TRANSLATIONS[trimmedKey] || TRANSLATIONS[trimmedKey.toLowerCase()] || trimmedKey;
}
