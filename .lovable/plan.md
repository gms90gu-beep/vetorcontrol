# Fase 3 — Camada `block_progress`

Objetivo: criar uma fonte única de verdade para o estado operacional do quarteirão, independente da Produção Diária. Nenhum consumidor recalcula mais progresso a partir das visitas — todos leem de `block_progress`.

## 1. Banco (migration)

Nova tabela `public.block_progress`:

- Chaves: `id uuid pk`, `cycle_id uuid fk cycles`, `block_number text`, `agent_id uuid fk profiles(id)`
- Timestamps: `started_at`, `completed_at`, `last_visit_at`, `last_operational_date date`, `last_sync timestamptz`, `updated_at`
- Estado: `status text` (`NOT_STARTED | IN_PROGRESS | PAUSED | COMPLETED`), `completion_percentage numeric`
- Contadores: `total_properties`, `visited_properties`, `pending_properties`, `closed_properties`, `recovered_properties`, `positive_focus`, `negative_focus`, `tb_properties`, `pe_properties`
- Constraint: `UNIQUE (cycle_id, block_number, agent_id)`
- GRANT SELECT/INSERT/UPDATE authenticated; ALL service_role
- RLS: agente lê/escreve suas próprias linhas (`agent_id = auth.uid()`); supervisor/coordenador/admin_master leem todas (`has_role`)
- Trigger `updated_at`
- Função `public.recompute_block_progress(_cycle_id uuid, _block_number text, _agent_id uuid)` — recalcula a partir de `properties` (total) e `visits` (agregados) e faz upsert. Usada pelo pós-sync e pelo trigger em `visits`.
- Trigger `AFTER INSERT/UPDATE/DELETE ON visits` que chama a função para o par (bloco, agente) impactado.

## 2. Repositório local (offline)

- Adicionar store `block_progress` em `src/lib/offline/db.ts` (nova `version(3)`).
- `src/lib/offline/repos/blockProgress.ts`:
  - `getBlockProgress(cycle_id, block_number, agent_id)`
  - `listBlockProgress(agent_id)`
  - `upsertBlockProgress(row)` (via `safeFetch` + Dexie mirror)
  - `applyLocalVisitDelta(...)` — atualiza contadores localmente logo após registrar visita, mesmo offline; enfileira `rpc: recompute_block_progress` para reconciliação.

## 3. Hook de leitura único

`src/hooks/useBlockProgress.ts` — devolve `{ status, totalProperties, visitedProperties, pendingProperties, closedProperties, completionPercentage, startedAt, completedAt, lastVisitAt }`. Fonte: Dexie mirror + Supabase Realtime opcional.

## 4. Escrita — pipeline de visita

Em `PropertyVisitButtons` / `useOfflineMutation('visit')` (após enfileirar a mutação de `visits`):

1. Chamar `applyLocalVisitDelta(...)` (atualiza `block_progress` local imediatamente).
2. Enfileirar `rpc: recompute_block_progress` para o par (bloco, agente).
3. Log `[BLOCK_PROGRESS_UPDATE]`.
4. Se `pending === 0` → marcar `COMPLETED` + `completed_at` + log `[BLOCK_PROGRESS_COMPLETED]`.

## 5. Encerramento do expediente

`DailyWorkCloser.handleCloseDay`:

- Se restarem pendentes: setar `status = PAUSED` no `block_progress` do bloco ativo + log `[BLOCK_PROGRESS_PAUSED]`.
- Não alterar `daily_work_records` (continua usando `operational_date`).

## 6. Retomada da jornada

`src/routes/_authenticated.field-work.tsx` — `assessSessionForResume`:

- Primeira consulta passa a ser `block_progress` (`status === PAUSED`).
- `field_work_sessions` vira apenas timeline. Se `block_progress.status === COMPLETED`, bloqueia retomada com `blocked_by_block_progress`.

## 7. Consumidores migrados para `useBlockProgress`

- Tela de Trabalho (barras/percentual)
- `OperationalPanel` / cards de quarteirão
- `AgentDashboard` cards
- `SupervisionDashboard` / `AgentProductionRanking`
- `RGOperationalMap` (barra de progresso)
- `BlockOperationalMap` (legenda de status)

Cada consumidor emite `[BLOCK_PROGRESS_READ] { module }`.

## 8. Produção Diária permanece separada

Não alterar: `DailyWorkCloser` (cálculo do DWR), PDFs, boletins, `_authenticated.relatorios`, `_authenticated.reports`. Continuam usando `visits` filtrado por `operational_date`.

## 9. Sincronização

`src/lib/offline/sync.ts` — após drain da fila de `visits`, chamar `recompute_block_progress` para cada `(cycle_id, block_number, agent_id)` distinto processado + log `[BLOCK_PROGRESS_SYNC]`.

## 10. Auditoria e integridade

`src/lib/block-progress-audit.ts`:

- Logs: `[BLOCK_PROGRESS_UPDATE]`, `[BLOCK_PROGRESS_SYNC]`, `[BLOCK_PROGRESS_COMPLETED]`, `[BLOCK_PROGRESS_PAUSED]`, `[BLOCK_PROGRESS_RESUMED]`, `[BLOCK_PROGRESS_RECALCULATED]`.
- Validação `visited + pending === total` → `[BLOCK_PROGRESS_INTEGRITY_ERROR]` com esperado/encontrado/origem.
- Nova rota admin `/admin/block-progress-audit` (tabela simples) listando divergências.

## Detalhes técnicos

- Migration Postgres em uma única chamada (`CREATE TABLE` → `GRANT` → `RLS` → `POLICY` → função + triggers).
- Dexie `version(3)` adiciona store `block_progress: "id, cycle_id, block_number, agent_id, status, updated_at"`.
- Realtime opcional (`supabase.channel('block_progress')`) — habilitar no `useBlockProgress` só quando `navigator.onLine`.
- Rollout: entrega em 3 PRs internos — (a) migration + repo + hook; (b) escrita/pause/complete + sync; (c) migração dos consumidores + auditoria.

Aprove para eu começar pelo passo 1 (migration).
