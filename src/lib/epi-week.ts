// Semana epidemiológica (ISO week / ano)
// Fonte de verdade para filtros de período no Mapa Operacional Fase 2.

export type EpiRange = { from: string; to: string; label: string };

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ISO week (Monday-Sunday). CDC epi week é domingo-sábado, mas Brasil usa ISO.
function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 0 = segunda
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day);
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return monday;
}

export function getCurrentEpiWeek(): { year: number; week: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { year: d.getUTCFullYear(), week };
}

export function epiWeekRange(year: number, week: number): EpiRange {
  const start = isoWeekStart(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { from: toIso(start), to: toIso(end), label: `SE ${week}/${year}` };
}

export function currentEpiRange(): EpiRange {
  const { year, week } = getCurrentEpiWeek();
  return { ...epiWeekRange(year, week), label: `SE Atual (${week}/${year})` };
}

// Um ano ISO tem 52 ou 53 semanas — verifica olhando se a quinta-feira da
// semana 53 ainda cai dentro do mesmo ano (regra ISO 8601).
function weeksInIsoYear(year: number): number {
  const week53Monday = isoWeekStart(year, 53);
  const week53Thursday = new Date(week53Monday);
  week53Thursday.setUTCDate(week53Monday.getUTCDate() + 3);
  return week53Thursday.getUTCFullYear() === year ? 53 : 52;
}

export function previousEpiRange(): EpiRange {
  const { year, week } = getCurrentEpiWeek();
  const prevYear = week > 1 ? year : year - 1;
  const prevWeek = week > 1 ? week - 1 : weeksInIsoYear(prevYear);
  return {
    ...epiWeekRange(prevYear, prevWeek),
    label: `SE Anterior (${prevWeek}/${prevYear})`,
  };
}

export function lastNWeeksRange(n: number): EpiRange {
  const { year, week } = getCurrentEpiWeek();
  const end = epiWeekRange(year, week).to;
  // n semanas para trás incluindo a atual
  let w = week - (n - 1);
  let y = year;
  while (w < 1) {
    y -= 1;
    w += weeksInIsoYear(y);
  }
  const start = epiWeekRange(y, w).from;
  return { from: start, to: end, label: `Últimas ${n} semanas` };
}
