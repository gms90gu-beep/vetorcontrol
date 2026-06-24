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

export function previousEpiRange(): EpiRange {
  const { year, week } = getCurrentEpiWeek();
  const prevWeek = week > 1 ? week : 52;
  const prevYear = week > 1 ? year : year - 1;
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
    w += 52;
    y -= 1;
  }
  const start = epiWeekRange(y, w).from;
  return { from: start, to: end, label: `Últimas ${n} semanas` };
}
