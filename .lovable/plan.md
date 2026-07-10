# Suíte de Regressão VetorControl

Cobertura média: unitários, integração (com Supabase mockado), E2E Playwright, offline (Dexie real via fake-indexeddb) e CI bloqueante no GitHub Actions.

## 1. Infraestrutura

Instalar: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `fake-indexeddb`, `@playwright/test`, `msw`.

Novos arquivos de config:
- `vitest.config.ts` — jsdom, setup file, alias `@`, coverage.
- `tests/setup.ts` — jest-dom, `fake-indexeddb/auto`, mocks globais (`matchMedia`, `navigator.geolocation`, `navigator.onLine`).
- `tests/mocks/supabase.ts` — factory de client mockado (from/rpc/auth encadeáveis).
- `tests/mocks/geolocation.ts` — helpers `mockGeoSuccess/Denied/Unavailable/Timeout`.
- `playwright.config.ts` — baseURL `http://localhost:8080`, chromium, reuse dev server.
- Scripts em `package.json`: `test`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`.

## 2. Testes unitários (`tests/unit/`)

- `operational-date.test.ts` — `getOperationalDate` (22:30 BRT, 23:59 BRT, virada UTC), `epiWeekFromDate`, `getOperationalVisitDate`, `assertProductionDate`.
- `property-order.test.ts` — ordenação, complemento, sequência de navegação.
- `session-state.test.ts` — máquina de estados da jornada.
- `production-integrity.test.ts` — validações de DWR/visita.
- `epi-week.test.ts` — semana epidemiológica.
- `cycle-week.test.ts` — resolução de ciclo/semana.

## 3. Testes de integração (`tests/integration/`)

Supabase mockado, Dexie real.

- `dwr-close.test.tsx` — `DailyWorkCloser` fecha jornada com `status='completed'`, `end_time`, `work_date` corretos, `onConflict='legacy_agent_id,work_date'`.
- `dwr-rebuild.test.ts` — chama RPC `rebuild_daily_work_records`, verifica idempotência (2 chamadas → mesmo estado).
- `dashboard-vs-dwr.test.ts` — totais do dashboard batem com soma de DWR.
- `reports-vs-dwr.test.ts` — relatórios semanais consistentes com DWR.
- `session-visits.test.ts` — RPC `get_session_visits` + filtros Pendentes/Visitados/Fechados.

## 4. Offline (`tests/offline/`)

- `dexie-queue.test.ts` — enfileirar mutação offline, `pendingMutationCount`.
- `sync-flush.test.ts` — reconexão dispara `flushMutations`, remove itens ok.
- `sync-retry.test.ts` — erro incrementa `tries`, respeita `MAX_RETRIES`.
- `sync-conflict.test.ts` — `23505` tratado como sucesso.
- `sync-rebuild.test.ts` — `purgeInvalidTmpMutations` remove IDs legados.

Reutiliza `tests/offline/offline-suite.spec.ts` existente para E2E offline.

## 5. Playwright E2E (`tests/e2e/`)

Session Supabase injetada via `LOVABLE_BROWSER_SUPABASE_*` (skip gracioso se ausente).

- `jornada.spec.ts` — iniciar, continuar, encerrar.
- `trabalho.spec.ts` — abrir tela de trabalho, navegar entre imóveis.
- `rg.spec.ts` — gerar RG.
- `pdf.spec.ts` — exportar PDF (verifica download).
- `dashboard.spec.ts` — carrega KPIs.
- `relatorios.spec.ts` — carrega relatórios.

## 6. CI (`.github/workflows/ci.yml`)

Jobs em PRs:
1. `lint-typecheck` — `tsgo`.
2. `unit` — `bun test:unit --coverage`.
3. `integration` — `bun test:integration`.
4. `e2e` — `bun run build && bun test:e2e`.

Todos required checks; falha em qualquer suíte de Produção/Jornada/Dashboard/Relatórios/DWR bloqueia merge (via matriz de jobs nomeados e branch protection).

Documentação `docs/testing.md` explicando como rodar e adicionar testes.

## Detalhes técnicos

- Mock do Supabase usa chain builder retornando `{ data, error }` para `.from().select().eq()...` e `.rpc()`.
- Dexie usa `fake-indexeddb/auto` no setup, resetado em `beforeEach`.
- Geolocation via `Object.defineProperty(navigator, 'geolocation', { value: mock })`.
- Playwright roda contra dev server já ativo em `:8080`; sem gerenciar ciclo de vida.
- Testes de integridade SQL (pgTAP) ficam fora — exigem banco Postgres dedicado; será TODO documentado.

## Entrega

Vou executar em 2 turnos:
- **Turno 1 (este):** config, setup, mocks, todos os unitários e de integração, offline unit tests, workflow CI, docs.
- **Turno 2 (próximo):** specs Playwright E2E (após confirmar que unit/integration passam).

Confirma para eu começar?