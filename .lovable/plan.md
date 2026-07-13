
# Migração para `block_progress` como fonte única de progresso

Objetivo: substituir todos os cálculos locais de "visitados / pendentes / percentual / status do quarteirão" pelo hook `useBlockProgress()` (ou `getBlockProgress()` fora de React), mantendo o `block_progress` como única fonte de verdade.

## Lote 1 — Painel operacional (prioridade máxima)

Arquivo: `src/components/field-work/OperationalPanel.tsx`

- Consumir `useBlockProgress({ cycle_id, block_number, agent_id, module: "OperationalPanel" })`.
- Substituir os campos derivados hoje em `stats` (via `getOperationalBlockStatus`) por leitura direta do hook:
  - `visited → progress.visited_properties`
  - `closed → progress.closed_properties`
  - `pendingCount → progress.pending_properties`
  - `total → progress.total_properties` (fallback para `properties.length` só quando `progress` ainda estiver carregando)
  - `progress% → progress.completion_percentage`
  - `status → progress.status` (usado para os badges "Em andamento / Concluído")
- Manter `visits`, `deposits`, `properties` apenas para: mapa, filtros da lista, contagem de focos, larvicida, depósitos e sem-GPS — nunca para progresso.
- Remover `getOperationalBlockStatus` / `logBlockStatusShared` deste componente.
- Emitir `console.info("[BLOCK_PROGRESS_MIGRATION]", { module: "OperationalPanel", hook: "useBlockProgress", version: 1 })` uma vez no mount.

## Lote 2 — Dashboards

Arquivos:
- `src/components/agent/AgentDashboard.tsx`
- `src/components/supervision/SupervisionDashboard.tsx`
- Qualquer card em `src/components/field-work/*` que mostre "progresso do quarteirão".

Alterações:
- Onde hoje há `visits.filter(...)`, `properties.filter(...)` ou `reduce` para calcular progresso de um quarteirão, trocar por `useBlockProgress()` (uso pontual por card) ou `getBlockProgress(cycle_id, block_number, agent_id)` em loops server-side.
- Para listas com vários quarteirões, criar helper `getBlockProgressBatch(cycle_id, agent_id, block_numbers[])` em `src/lib/offline/repos/blockProgress.ts` que busca em lote (Dexie + Supabase fallback).
- Emitir `[BLOCK_PROGRESS_MIGRATION]` por módulo.

## Lote 3 — RG e Mapa

Arquivos:
- `src/components/rg/RGOperationalMap.tsx`
- `src/components/field-work/BlockOperationalMap.tsx`
- Cards de resumo em `src/routes/_authenticated.rg*.tsx`.

Alterações:
- Marcadores continuam vindo de `visits` (localização geográfica).
- Cabeçalho / badge de status geral do quarteirão passa a ler de `useBlockProgress()`.
- Legenda operacional (Visitado / Pendente / Fechado / Foco / PE / TB) permanece; contadores acima da legenda passam a vir do hook.

## Guardas anti-regressão

- Criar utilitário `src/lib/block-progress-audit.ts` (já existe parcialmente) com `warnDirectCalc({ file, line, reason })` que emite `[BLOCK_PROGRESS_DIRECT_CALC]`.
- Adicionar comentário `// BLOCK_PROGRESS_SOURCE_OF_TRUTH` acima do uso do hook em cada consumidor.
- Adicionar teste-lint via `rg` documentado no README interno: `rg -n "visits\\.filter|properties\\.filter" src/components/{field-work,agent,supervision,rg}` não deve retornar cálculos de progresso.

## Integridade automática

Em `useBlockProgress` (uma única alteração), após obter `progress`:
- Se `progress.total_properties !== progress.visited_properties + progress.pending_properties + progress.closed_properties + progress.refused_properties`, emitir:
  `console.warn("[BLOCK_PROGRESS_INTEGRITY_ERROR]", { module, cycle_id, block_number, agent_id, ...progress })`
  e disparar `recompute_block_progress` via `enqueueRpcOffline`.

## Detalhes técnicos

- Nenhum consumidor deve ler `block_progress` direto do Supabase — sempre via `getBlockProgress` (Dexie-first, com fallback remoto) ou `useBlockProgress`.
- Sessão/`field_work_sessions` continua sendo timeline (não é fonte de progresso).
- `DailyWorkCloser` e relatórios PDF **não mudam** — continuam usando `operational-metrics` / `daily_work_records`.
- `BlockOperationalMap` deve receber `progress` via prop opcional, caindo para hook interno se ausente (evita duas leituras no OperationalPanel).

## Ordem de execução sugerida (uma resposta cada)

1. Lote 1 — OperationalPanel + integridade em `useBlockProgress`.
2. Lote 2a — `AgentDashboard`.
3. Lote 2b — `SupervisionDashboard` + `getBlockProgressBatch`.
4. Lote 3 — `RGOperationalMap` + `BlockOperationalMap`.
5. Sweep final: rodar o `rg` de guarda, remover `getOperationalBlockStatus` onde não for mais usado.
