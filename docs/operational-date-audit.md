# Auditoria de Data Operacional — `public.operational_date()`

> Gerado manualmente em 10/07/2026. Escopo: todas as ocorrências de cálculo de data que impactam produção, consolidação, relatórios e filtros. **Nenhuma alteração foi aplicada** — este é o relatório prévio solicitado.

Referência canônica:
- SQL: `public.operational_date(ts timestamptz) RETURNS date` → `(ts AT TIME ZONE 'America/Sao_Paulo')::date` (migration `20260709235339`).
- TS: `src/lib/operational-date.ts` (`getOperationalVisitDate`, `getOperationalDayRange`) e o helper `localDate()` em `src/lib/reports-reconcile.functions.ts`.

Regra de ouro: **qualquer conversão de `timestamptz` → `date` que represente "dia da produção" deve passar por `operational_date()` (SQL) ou pelos helpers TS acima**. `CURRENT_DATE` só é aceitável em contexto administrativo (status de ciclo, defaults). `toISOString().slice(0,10)` só é aceitável para nomes de arquivo/rótulos visuais.

---

## 🔴 Crítica — bug de produção confirmado, corrompe consolidação

| # | Arquivo | Linha | Problema | Correção recomendada |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260609143124_…sql` (função `finalize_shift_pendencies`) | 71, 80, 92 | `visit_date::date = p_date` em UTC — pendências do turno noturno caem no dia seguinte. | Já sobrescrito pela migration `20260709235339`. Ação: **confirmar que a versão em produção é a nova**; se qualquer redeploy re-rodar a antiga, o bug volta. Marcar a migration antiga como *superseded*. |
| 2 | `supabase/migrations/20260705015322_…sql` (função `recover_session_visits`) | 34, 55, 84 | `v.visit_date::date = s.session_date` em UTC — recovery de sessão perde visitas noturnas. | Idem #1 — substituída em `20260709235339`. Validar que a versão vigente usa `public.operational_date(v.visit_date)`. |
| 3 | `supabase/migrations/20260628151729_…sql` (trigger `fill_cycle_week_from_date` + backfill) | 94, 151, 152 | `NEW.visit_date::date` e `v.visit_date::date` — resolve ciclo/semana pela data UTC. | Trigger já foi substituído em `20260709235339`. O UPDATE de backfill (linhas 151–152) **é one-shot já executado, mas se re-executado hoje reintroduz o bug**. Reescrever para `public.operational_date(v.visit_date)` antes de rodar de novo. |
| 4 | `src/lib/reports-reconcile.functions.ts` | 228 | `is_retroactive: g.work_date < new Date().toISOString().slice(0,10)` — compara com "hoje" UTC. | Usar `localDate(new Date().toISOString())` (helper já existe no arquivo, linhas 54-58) para obter o "hoje" em America/Sao_Paulo. |
| 5 | `src/lib/reports-reconcile.functions.ts` | 229-232 | `wd.getUTCFullYear()` / `getUTCDate()` — semana e ano epidemiológicos calculados em UTC. | Derivar via `epiWeekFromDate(new Date(g.work_date + 'T12:00:00-03:00'))` ou usar `src/lib/epi-week.ts` alimentado com data local. |
| 6 | `src/components/DailyWorkCloser.tsx` | 322, 398-399, 424, 659, 929 | `new Date().toISOString().split('T')[0]` como fallback do `work_date` de fechamento de jornada. Após ~21h de Brasília, gera data do dia seguinte e a jornada é registrada no dia errado. | Substituir por `getOperationalDayRange().dateOnly` (`src/lib/operational-date.ts`) ou por `localDate(new Date().toISOString())`. Preferir sempre `active?.session_date` primeiro. |
| 7 | `src/components/DailyWorkCloser.tsx` | 937-939 | `d.getUTCDay()` / `getUTCFullYear()` para calcular semana epi. | Trocar por variante local (usar componentes locais ou o helper de `epi-week.ts`). |

## 🟠 Alta — pode falsear filtros/relatórios

| # | Arquivo | Linha | Problema | Correção |
|---|---|---|---|---|
| 8 | `src/components/supervision/SupervisionDashboard.tsx` | 98 | `todayISO = todayStart.toISOString().slice(0,10)` — "hoje" em UTC como filtro do painel. | Usar `getOperationalDayRange().dateOnly`. |
| 9 | `src/components/supervision/CoordinatorDashboard.tsx` | 55 | Idem #8. | Idem. |
| 10 | `src/components/supervision/AgentProductionRanking.tsx` | 15 | Helper interno converte `Date → ISO UTC` para query de produção. | Substituir por helper local (America/Sao_Paulo). |
| 11 | `src/components/agent/AgentDashboard.tsx` | 98 | `todayIso` UTC alimenta filtro de DWR do agente. | Usar helper local. |
| 12 | `src/components/agent/MyWeeklyConsolidation.tsx` | 217, 223 | Fronteiras de semana calculadas via `toISOString().split('T')[0]`. | Usar `epi-week.ts` com data local. |
| 13 | `src/components/OperationalHeader.tsx` | 109 | Fallback de data operacional em UTC. | `getOperationalDayRange().dateOnly`. |
| 14 | `src/routes/_authenticated.relatorios.tsx` | 94, 97 | `from/to` default (últimos N dias) em UTC. | Usar helper local — impacta relatórios exibidos. |
| 15 | `src/routes/_authenticated.admin.dashboard.tsx` | 31 | `isoOffset()` gera datas em UTC para filtros do Painel Executivo. | Ajustar para America/Sao_Paulo. |
| 16 | `src/routes/_authenticated.heatmap.tsx` | 25 | Idem #15 (helper de conversão). | Idem. |
| 17 | `src/lib/active-cycle.ts` | 20 | `today` em UTC para descobrir ciclo ativo — vira/dia pode selecionar ciclo errado à meia-noite. | Usar data local. |
| 18 | `src/components/reports/WeeklyReportGenerator.tsx` | 40, 44, 46 | Logs e cálculo de semana/ciclo baseados em ISO UTC do `referenceDate`. | Passar `referenceDate` já normalizado para America/Sao_Paulo. |

## 🟡 Média — administrativo, baixo impacto direto na produção

| # | Arquivo | Linha | Observação |
|---|---|---|---|
| 19 | `supabase/migrations/20260709235339` | 26, 28, 29, 206 | `CURRENT_DATE` usado como fallback para `work_date`/`session_date` e para marcar `is_retroactive`. `CURRENT_DATE` no Postgres retorna a data do timezone da sessão (UTC por padrão no Supabase). Recomenda-se `public.operational_date(now())`. |
| 20 | `supabase/migrations/20260628151729` | 74, 95-97 | `CURRENT_DATE` em `get_current_cycle` e trigger; substituído em parte pela nova migration, mas `get_current_cycle` ainda usa `CURRENT_DATE`. Trocar por `public.operational_date(now())`. |
| 21 | `supabase/migrations/20260615024351` / `20260615025123` (`sync_cycle_statuses`, `data_audit_report`) | 9-10 | `v_today := CURRENT_DATE`. Impacto: transição de ciclo pode ocorrer 3h antes. Trocar por `public.operational_date(now())`. |
| 22 | `supabase/migrations/20260515193051` / `…193241` / `…193323` / `…213515` / `…182130` / `…035626` | várias | `DEFAULT CURRENT_DATE` em colunas `work_date` / `session_date` / `year`. Baixo risco (o app hoje sempre passa o valor), mas se um insert deixar default, cai o mesmo bug. Trocar defaults para `public.operational_date(now())`. |
| 23 | `src/lib/system-health.functions.ts` | 158 | `today = new Date().toISOString().slice(0,10)` usado em health check de ciclos. | Impacto meramente diagnóstico; ajustar para consistência. |

## 🟢 Baixa — nome de arquivo/rótulo, sem efeito em cálculo

Somente formatação de nomes de arquivos de exportação; **manter** ou padronizar para data local se importante para o usuário:

- `src/routes/_authenticated.pending.tsx:750`
- `src/routes/_authenticated.admin.georef-audit.tsx:116, 127, 134`
- `src/routes/_authenticated.admin.data-audit.tsx:262`
- `src/routes/_authenticated.admin.cycle-audit.tsx:31`
- `src/routes/_authenticated.admin.pendencias.tsx:30`
- `src/routes/_authenticated.field-work-list.tsx:925`
- `src/components/supervision/OperationalDashboard.tsx:126`
- `src/components/coordination/MunicipalIntelligence.tsx:139`
- `src/components/agent/BulletinPreview.tsx:38` (log)
- `src/lib/audit/go-live-report.ts:60, 112`
- `src/lib/audit/rc1-report.ts:72, 111`
- `src/lib/epi-week.ts` (7, 13, 24, 26, 29): implementação genérica de ISO week em UTC — **correta por design** desde que a entrada seja uma data (não timestamp de meia-noite UTC). Recomendado alimentar sempre com data local.

## 🔎 Não encontrados / OK

- Edge Functions (`supabase/functions/manage-agents`, `rg-ocr-process`): nenhuma agregação por data.
- `src/lib/wave-c.functions.ts`, `src/lib/reports-reconcile.functions.ts` (helper `localDate` linhas 54-58): **corretos**, usam offset America/Sao_Paulo.
- Migração `20260709235339`: implementação canônica de `operational_date()` e correções principais — **manter como fonte de verdade**.

---

## Resumo executivo

| Severidade | Ocorrências | Ação |
|---|---|---|
| 🔴 Crítica | 7 | Corrigir imediatamente (impacta consolidação, DWR, pendências). |
| 🟠 Alta | 11 | Corrigir na mesma janela (filtros de dashboards/relatórios). |
| 🟡 Média | 5 (grupos) | Programar refactor administrativo. |
| 🟢 Baixa | ~15 | Opcional (nomes de arquivo/logs). |

**Prioridade sugerida de execução:**
1. Itens 4-7 (`reports-reconcile.functions.ts`, `DailyWorkCloser.tsx`).
2. Itens 8-18 (dashboards e filtros de relatórios).
3. Itens 19-22 (migration nova para trocar `CURRENT_DATE` por `public.operational_date(now())` nas funções administrativas).
4. Itens 23 e Baixa — cosmético.

Aguardando aprovação para aplicar as correções por ordem de criticidade.
