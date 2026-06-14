# Consolidação Estrutural — RG → Trabalho → Boletins → Relatórios

Este é um trabalho grande (10 fases). Vou entregar em **ondas incrementais**, cada uma testável isoladamente, para evitar regressões no fluxo que já está funcionando (RG → Boletim RG → DailyWorkCloser → Boletim Diário, concluído nas Fases 1–3 anteriores).

---

## Onda A — Fundação de Auditoria e Sincronização (Fases 2, 3, 4)

**Objetivo:** dar visibilidade total ao admin e travar o fluxo RG → Trabalho.

1. **`/admin/auditoria`** (apenas `admin_master`)
   - Cards de totais: boletins RG, quarteirões, imóveis, visitas, daily_work_records.
   - Seção "Consistência": quarteirões sem imóveis, imóveis sem quarteirão, visitas órfãs, daily_work_records com `data_integrity_log.reconciled = true`.
   - Seção "Sincronização": resumo de `db.mutations` (pendentes, erros, última sync).
   - Server fn `getAuditSnapshot` com `requireSupabaseAuth` + checagem `has_role(admin_master)`.

2. **`/sync-status`** (todos os papéis autenticados)
   - Reaproveita `useSyncStatus` + `listFailedMutations`.
   - Status Online/Offline, última sync, contadores por tabela.
   - Botões: **Sincronizar agora** (`flushMutations`), **Reprocessar fila** (`retryFailedMutations`), **Limpar cache local** (com confirmação dupla — só apaga `db` se `mutations.count() === 0`, senão bloqueia).

3. **Validação RG → Trabalho** (Fase 4)
   - No `field-work` / `PropertyVisitButtons`: ao listar quarteirões, filtrar apenas os que possuem `properties` vinculadas via `boletins_rg`.
   - Se o agente tentar abrir um quarteirão sem imóveis, exibir toast bloqueante: *"Este quarteirão não possui imóveis cadastrados no RG."*

---

## Onda B — Inteligência Operacional (Fases 5, 7, 8)

**Objetivo:** transformar os boletins em ferramentas de análise.

4. **Ranking de agentes no Supervisor Dashboard** (Fase 5)
   - Adicionar tabela "Produção por Agente" em `SupervisionDashboard`, agregando `daily_work_records` da semana epidemiológica corrente, filtrado por `supervisor_id = auth.uid()`.
   - Colunas: agente, imóveis trabalhados, fechados, focos, depósitos, tubitos. Ordenação desc por imóveis trabalhados.

5. **Boletim Diário aprimorado** (Fase 7)
   - No `/_authenticated/daily-bulletin/$id`: adicionar barras de distribuição percentual por tipo de depósito e foco usando `withPercentages` (já existe em `daily-integrity.ts`).

6. **Boletim Semanal com comparativo** (Fase 8)
   - Em `MyWeeklyConsolidation` (ou nova rota): buscar semana atual e anterior, exibir delta (▲/▼ + %) para produção, focos, depósitos, tubitos, larvas.

---

## Onda C — Visão Global e PDFs Oficiais (Fases 6, 9, 10)

**Objetivo:** completar a camada gerencial e padronizar saídas oficiais.

7. **`/heatmap`** (Fase 6)
   - Mapa interativo (Leaflet) com camadas: produção, focos, depósitos. Agregação por `block_number`.

8. **PDF institucional** (Fase 9)
   - Helper `src/lib/pdf/institutional-header.ts`: cabeçalho (prefeitura, SMS, vigilância, município de `system_settings`) e rodapé (data, emissor, UUID, QR code via `qrcode`).
   - Aplicar em `DailyReportGenerator`, `WeeklyReportGenerator`, `PDFReportGenerator`, e no PDF do boletim diário.

9. **Dashboard Admin Master global** (Fase 10)
   - Filtros: município, supervisor, agente, bairro, localidade, semana, ciclo.
   - KPIs globais + produção por agente e por supervisor.

---

## Detalhes técnicos

### Migrations necessárias
- Nenhuma nova tabela; todas as fases consomem o que já existe (`daily_work_records`, `boletins_rg`, `properties`, `visits`, `weekly_bulletins`, `user_roles`).
- Adicionar view `v_daily_consistency` para a tela de auditoria (quarteirões sem imóveis, imóveis órfãos etc.) — opcional, pode ficar em SQL na server fn.

### Padrões a respeitar
- **Server fns** para todas as agregações (`createServerFn` + `requireSupabaseAuth`), nunca query Supabase direto em loader.
- **Rotas protegidas** sob `src/routes/_authenticated.*` (já há gate); papéis admin checados via `has_role` na server fn, não no client.
- **Offline-first**: telas de auditoria/heatmap/admin podem ser online-only (mostram skeleton quando offline). `/sync-status` deve funcionar 100% offline.
- **Sem recalcular** dados nos boletins — só ler `daily_work_records` (regra reforçada na Fase 3 anterior).

### Estrutura de arquivos prevista
```
src/routes/
  _authenticated.admin.auditoria.tsx        (Onda A)
  _authenticated.sync-status.tsx            (Onda A)
  _authenticated.heatmap.tsx                (Onda C)
  _authenticated.admin.dashboard.tsx        (Onda C)
src/lib/
  audit.functions.ts                        (Onda A)
  weekly-comparison.functions.ts            (Onda B)
  pdf/institutional-header.ts               (Onda C)
src/components/
  audit/ConsistencyPanel.tsx
  supervision/AgentRanking.tsx              (Onda B)
  reports/DepositDistributionBars.tsx       (Onda B)
```

---

## Pergunta antes de começar

Confirma que quer que eu **comece pela Onda A** (auditoria + sync-status + validação RG→Trabalho) agora? Ou prefere ordem diferente — por exemplo priorizar Onda B (ranking + boletins aprimorados) que afeta mais o dia-a-dia dos supervisores?
