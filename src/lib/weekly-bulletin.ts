export const WEEKLY_FIELDS = [["properties_worked", "Imóveis trabalhados"], ["properties_closed", "Fechados"], ["properties_refused", "Recusados"], ["properties_recovered", "Recuperados"], ["pending_visits", "Pendências registradas"], ["properties_positive", "Imóveis positivos"], ["strategic_points_worked", "Pontos estratégicos"], ["blocks_worked", "Quarteirões trabalhados"], ["blocks_completed", "Quarteirões concluídos"], ["positive_foci", "Focos positivos"], ["deposits_existing", "Depósitos existentes"], ["deposits_inspected", "Depósitos inspecionados"], ["deposits_treated", "Depósitos tratados"], ["deposits_eliminated", "Depósitos eliminados"], ["deposits_a1", "Depósitos A1"], ["deposits_a2", "Depósitos A2"], ["deposits_b", "Depósitos B"], ["deposits_c", "Depósitos C"], ["deposits_d1", "Depósitos D1"], ["deposits_d2", "Depósitos D2"], ["deposits_e", "Depósitos E"], ["samples_collected", "Amostras coletadas"], ["samples_total", "Total de amostras"], ["tubitos_collected", "Tubitos coletados"], ["tubitos_used", "Tubitos utilizados"], ["tubitos_properties", "Imóveis com tubitos"], ["larvae_collected", "Larvas coletadas"], ["cargas_collected", "Cargas coletadas"]] as const;

export function weeklyTotals(rows: Record<string, any>[]) {
  return Object.fromEntries(WEEKLY_FIELDS.map(([key]) => [key, rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)]));
}
export function weeklyLarvicide(rows: Record<string, any>[]) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const amount = Number(row.larvicide_amount) || 0;
    if (!amount) continue;
    const unit = String(row.larvicide_unit || "Unidade não informada");
    result[unit] = (result[unit] || 0) + amount;
  }
  return Object.entries(result).map(([unit, amount]) => `${amount} ${unit}`).join(" · ") || "0";
}
