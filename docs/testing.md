# Suíte de testes VetorControl

Cobertura média — Vitest + Testing Library + Playwright. CI bloqueante para
qualquer regressão nas áreas críticas: **Produção · Jornada · Dashboard ·
Relatórios · DWR**.

## Rodando localmente

```bash
bun install
bun run test:unit          # unitários (rápido)
bun run test:integration   # integração com Supabase mockado
bun run test:offline       # fila Dexie / sync engine
bun run test               # tudo acima
bun run test:coverage      # com cobertura V8

# E2E (requer app rodando em :8080)
bunx playwright install --with-deps chromium
bun run dev &
bun run test:e2e
```

## Estrutura

```
tests/
  setup.ts                     # jest-dom + fake-indexeddb + mocks globais
  mocks/
    supabase.ts                # createSupabaseMock({ tables, rpc, user })
    geolocation.ts             # mockGeoSuccess / Denied / Unavailable / Timeout
  unit/
    operational-date.test.ts   # getOperationalDate, epiWeekFromDate, assertProductionDate
    property-order.test.ts     # ordenação + sequência + complemento
    session-state.test.ts      # decisões de jornada
    production-integrity.test.ts # score/divergências
    epi-week.test.ts           # SE (SINAN)
    cycle-week.test.ts         # ciclo × semana × rótulos
  integration/
    dwr-close.test.ts          # upsertOffline → onConflict correto
    dwr-rebuild.test.ts        # RPC rebuild_daily_work_records idempotente
    dashboard-vs-dwr.test.ts   # totais somam consistentemente
    session-visits.test.ts     # get_session_visits + filtros
  offline/
    dexie-queue.test.ts        # enqueue + count + flush
    sync-conflict.test.ts      # 23505 tratado como sucesso
    sync-retry.test.ts         # tries incrementa até MAX_RETRIES
    sync-rebuild.test.ts       # purgeInvalidTmpMutations
    offline-suite.spec.ts      # (Playwright, mantido)
  e2e/
    smoke.spec.ts              # home + /auth carregam
    jornada.spec.ts            # requer LOVABLE_BROWSER_AUTH_STATUS=injected
    dashboard.spec.ts          # idem
```

## Regras

- **Nunca desabilitar** um teste da matriz sem PR de justificativa.
- Novos módulos em `src/lib/` DEVEM ganhar teste unitário.
- Novas RPCs SQL DEVEM ter teste de integração com fixture no `createSupabaseMock`.
- Novos fluxos de campo (jornada / trabalho / RG / PDF) DEVEM ter spec Playwright.

## CI

`.github/workflows/ci.yml` roda jobs paralelos:
1. `typecheck`
2. `unit` — Produção · Jornada · DWR
3. `integration` — Dashboard · Relatórios · DWR
4. `offline` — Dexie / Sync
5. `e2e` — Playwright smoke (depende de 2–4)

Configure branch protection para exigir todos como *required checks*.

## TODOs

- pgTAP para integridade SQL (`status='completed' ⇒ end_time NOT NULL`, DWR
  duplicados, visitas sem `property_id`) — requer banco Postgres dedicado.
- Playwright completo (RG, PDF, relatórios) — depende de sessão injetada.
