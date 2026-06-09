# Offline First — VetorControl

Objetivo: permitir que o ACE trabalhe sem internet (RG, visitas, depósitos, focos, larvicida, tubitos, pendências e jornada), com sincronização automática quando voltar online e indicador 🟢/🔴 no cabeçalho.

## Arquitetura

```text
UI (componentes existentes)
   │
   ▼
Repositórios (src/lib/offline/repos/*)
   │  read: IndexedDB primeiro, fallback Supabase
   │  write: IndexedDB + fila de mutações
   ▼
Dexie (IndexedDB)  ──►  SyncEngine  ──►  Supabase
                          ▲
                          │ window.online / intervalo / boot
```

## Pacotes
- `dexie` (IndexedDB tipado)
- `vite-plugin-pwa` + `workbox-window` (Service Worker conforme skill PWA: `generateSW`, `NetworkFirst` para navegações, registro só em produção fora do preview)

## Banco local (Dexie — `src/lib/offline/db.ts`)
Tabelas espelhando o Supabase apenas no necessário:
- `properties`, `blocks`, `boletins_rg`, `visits`, `visit_deposits`, `property_pendencies`, `field_work_sessions`, `daily_work_records`
- `mutations`: fila `{ id, table, op: 'insert'|'update'|'delete', payload, createdAt, tries, lastError, status }`
- `meta`: chaves de versão / `lastSyncAt` por tabela

IDs gerados localmente com `crypto.randomUUID()` para permitir criação offline (já é o padrão das tabelas — `gen_random_uuid()`).

## Repositórios (`src/lib/offline/repos/`)
Um por domínio: `properties.ts`, `visits.ts`, `deposits.ts`, `pendencies.ts`, `sessions.ts`, `boletins.ts`.
API uniforme:
```ts
list(filter) // lê Dexie; se online e cache velho, refetch Supabase em background
get(id)
create(data)  // grava Dexie + enfileira insert
update(id, patch) // grava Dexie + enfileira update
remove(id) // grava Dexie + enfileira delete
```
Substituir progressivamente as chamadas diretas a `supabase.from(...)` nas telas envolvidas (RG editar, property detail, DailyWorkCloser, pending, field-work).

## Sync Engine (`src/lib/offline/sync.ts`)
- Dispara em: boot do app, `window.addEventListener('online')`, intervalo 30s, após cada mutação se online.
- Processa `mutations` em ordem FIFO, agrupando por tabela. Em sucesso remove da fila; em falha incrementa `tries` e mantém com `lastError`.
- Pull incremental por tabela usando `updated_at > lastSyncAt` (já existem `updated_at` nas tabelas).
- Conflitos: last-write-wins do servidor no pull; mutações locais pendentes nunca são sobrescritas até serem aplicadas.

## PWA / Service Worker
- Adicionar `vite-plugin-pwa` em `vite.config.ts` (via `vite:` passthrough do preset Lovable).
- `registerType: 'autoUpdate'`, `injectRegister: null`, `devOptions.enabled: false`.
- Manifest: nome "VetorControl", `display: standalone`, theme `#0f172a`, ícones em `public/icons/`.
- Wrapper `src/lib/pwa/register.ts` com guardas (skill PWA): não registra em dev, iframe, `id-preview--*`, `preview--*`, `*.lovableproject.com`, `?sw=off`.
- Runtime caching: `NetworkFirst` para navegações HTML; `CacheFirst` para assets hashados; excluir `/~oauth` e chamadas Supabase do fallback.

## Indicador Online/Offline
- Hook `useOnlineStatus()` (`navigator.onLine` + listeners).
- Componente `<ConnectivityBadge />` exibido no `OperationalHeader` (🟢 Online / 🔴 Offline + contador de mutações pendentes via Dexie `liveQuery`).

## Telas afetadas (apenas troca da camada de dados)
- `src/routes/_authenticated.rg.editar.$id.tsx` — usa `repos/properties` e `repos/boletins`.
- `src/routes/_authenticated.property.$propertyId.tsx` — `repos/visits`, `repos/deposits`, `repos/pendencies`.
- `src/components/DailyWorkCloser.tsx` — `repos/sessions` + geração de pendências local.
- `src/routes/_authenticated.pending.tsx` — `repos/pendencies`.
- `src/routes/_authenticated.field-work.tsx` — `repos/sessions`.
- `src/components/OperationalHeader.tsx` — adicionar badge.

## Segurança
- Nada é descartado: toda escrita vai para Dexie antes de tentar rede.
- Mutações com erro permanecem na fila com `lastError` visível em tela de diagnóstico simples (`/settings` → "Sincronização").
- Limpeza do IndexedDB no logout para não vazar dados entre usuários.

## Fora deste escopo (próximas etapas, conforme pedido)
GPS de visitas, geolocalização dos imóveis, mapa operacional, cobertura territorial.

## Entrega faseada
1. Infra: Dexie + repos + SyncEngine + badge (sem PWA).
2. Migração das telas RG e Visita para os repos.
3. PWA (`vite-plugin-pwa`) + manifest + ícones + wrapper guardado.
4. Tela de diagnóstico de sincronização em `/settings`.

Confirma para eu começar pela Fase 1?
