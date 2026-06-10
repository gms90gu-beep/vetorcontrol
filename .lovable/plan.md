# Auditoria do Fluxo de Relatórios

Vou executar a auditoria em 5 etapas, com mudanças cirúrgicas para garantir que a **diária** seja a única fonte de verdade do **Boletim Semanal**.

---

## ETAPA 1 — Encerramento da Jornada (`DailyWorkCloser`)

**Estado atual:** já grava ~20 campos em `daily_work_records` (snapshot completo) na refatoração anterior.

**Ajustes:**
- Adicionar log `[DIARIA_SALVA] { id, agent_id, work_date, cycle_id }` após o upsert retornar.
- Validar que TODOS os campos da auditoria estão sendo gravados (worked, closed, refused, recovered, pending, LI, A1/A2/B/C/D1/D2/E, focos, tubitos, amostras, larvicida, quarteirões).
- Migration leve: garantir colunas que faltam em `daily_work_records` (ex.: `depositos_por_tipo` JSON, ou colunas planas `dep_a1..dep_e` se ainda não existirem).

---

## ETAPA 2 — Área Relatórios (`/relatorios`)

**Problema:** `ReportsDashboard` hoje consulta `visits` direto — mistura origem de dados.

**Mudanças em `src/components/reports/ReportsDashboard.tsx`:**
- Trocar query base de `visits` por `daily_work_records` (filtrado por `agent_id` + `cycle_id` ativo).
- Nova seção **"Relatórios Diários do Ciclo: X"** com tabela:
  Data · Ciclo · Semana do Ciclo · SE · Imóveis · Fechados · Recusas · Focos · Status (✓ Consolidada).
- KPIs passam a ser somatório das diárias, não contagem de visits.

---

## ETAPA 3 — Painel "Meu Consolidado Semanal" (Agente)

**Novo componente:** `src/components/agent/MyWeeklyConsolidation.tsx`
- Buscar `daily_work_records` da SE atual (epi_week/epi_year) do agente logado.
- Exibir: SE atual, "Diárias: X de 5", Imóveis, Fechados, Recusas, Focos, Tubitos, Larvicida (g), Cobertura %.
- Inserir no `AgentDashboard`.

---

## ETAPA 4 — Boletim Semanal vira soma das diárias

**Em `src/components/reports/WeeklyReportGenerator.tsx`:**
- Refatorar para somar `daily_work_records` da SE em vez de recalcular a partir de `visits`.
- Adicionar **validador de integridade**: se Σ(diárias) divergir de uma checagem cruzada (ou se houver dia útil sem diária consolidada), abortar com toast explicando o motivo.
- Log `[BOLETIM_FONTE] daily_work_records count=N`.

---

## ETAPA 5 — Aba "Prévia do Boletim" (Agente)

**Novo componente:** `src/components/agent/BulletinPreview.tsx`
- Mesmos totais do boletim oficial, calculados ao vivo a partir das diárias já consolidadas da semana.
- Tabela com: totais acumulados, depósitos por tipo (A1–E), focos, tubitos, larvicida, cobertura.
- Adicionar como nova aba/cartão dentro do `AgentDashboard`.

---

## Detalhes Técnicos

- **Fonte única:** `daily_work_records` para tudo que for relatório/boletim. `visits` continua sendo a fonte operacional do dia, mas relatórios não a leem mais.
- **Filtro de ciclo:** já existe `getActiveCycleForUser` — reaproveitar.
- **SE:** já existe `getEpiWeek` em `src/lib/cycle-week.ts`.
- **Migration:** adicionar colunas faltantes em `daily_work_records` se necessário (verificar primeiro com `read_query`).
- **Offline:** o upsert de `daily_work_records` já passa pela fila offline; sem mudança.

---

## Arquivos Afetados

- `src/components/DailyWorkCloser.tsx` (log + verificação de campos)
- `src/components/reports/ReportsDashboard.tsx` (refatoração da fonte de dados + tabela de diárias)
- `src/components/reports/WeeklyReportGenerator.tsx` (somatório de diárias + validação)
- `src/components/agent/AgentDashboard.tsx` (inclusão dos novos painéis)
- `src/components/agent/MyWeeklyConsolidation.tsx` (novo)
- `src/components/agent/BulletinPreview.tsx` (novo)
- Migration Supabase, se faltar coluna em `daily_work_records`

Posso prosseguir com a implementação?
