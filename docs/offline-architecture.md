# Arquitetura Offline — Mapa de Fluxo de Dados (Fase A)

> Estado atual auditado antes da consolidação Fase B/C.
> Fonte da verdade futura: **1 módulo = 1 tabela servidor = 1 store local oficial**.

## Stores Dexie existentes

| DB Dexie | Arquivo | Tabelas |
|---|---|---|
| `AppDB` (`vetorcontrol-app`) | `src/db/database.ts` | `rg`, `fieldWork`, `pendingItems`, `properties`, `sessions`, `syncQueue` |
| `OfflineDB` (`vetorcontrol-offline`) | `src/lib/offline/db.ts` | `mutations`, `properties`, `blocks`, `boletins_rg`, `visits`, `visit_deposits`, `property_pendencies`, `property_recovery_attempts`, `field_work_sessions`, `daily_work_records`, `cycles`, `weeks`, `profiles`, `agents`, `meta` |

## Mapa por módulo

| Módulo | Tabela Supabase | Cache **oficial** (Fase B) | Caches paralelos a remover | Leitores | Escritores |
|---|---|---|---|---|---|
| **RG** | `boletins_rg` | `OfflineDB.boletins_rg` | `AppDB.rg` (legado) | `useRGRecords` (RG, Trabalho) | `useRGRecords.fetchFromAPI`, `useOfflineMutation('rg')`, `syncEngine` |
| **Trabalho** | `field_work_records` | `AppDB.fieldWork` | — | `useFieldWorkRecords` | `useFieldWorkRecords.fetchFromAPI`, `useOfflineMutation('field-work')`, `syncEngine` |
| **Pendências** | `pending_records` | `AppDB.pendingItems` | — | `usePendingRecords` | `usePendingRecords.fetchFromAPI`, `useOfflineMutation('pending')`, `syncEngine` |
| **Imóveis** | `properties` | `OfflineDB.properties` | `AppDB.properties` (uso pontual em `geolocation.ts`, `property.$propertyId.tsx`) | `usePropertyRecords`, rota imóvel | `useOfflineMutation('property')`, `syncEngine`, geolocation |

## Problemas detectados na auditoria

1. **RG lê de DOIS caches** (`AppDB.rg` + `OfflineDB.boletins_rg`) e une por id.
   Quando `userId` chega `undefined`, a união vaza registros de outros usuários e
   o usuário vê quarteirões fantasmas / quarteirões somem na próxima reconciliação.
2. `AppDB.rg` recebe escritas paralelas vindas de `useOfflineMutation` e do
   `fetchFromAPI`, mas a UI do **Trabalho** lê só de `OfflineDB.boletins_rg` →
   tela RG ≠ tela Trabalho para o mesmo agente.
3. `syncEngine` ainda enfileira mutações contra `AppDB.rg`, mantendo o cache legado
   "vivo" mesmo após a limpeza one-shot.
4. Imóveis duplicam cache (`AppDB.properties` vs `OfflineDB.properties`) — risco
   menor porque escrita primária é em `OfflineDB`, mas vale unificar.

## Decisões Fase B

- **RG**: `useRGRecords` passa a ler/gravar **somente** em `OfflineDB.boletins_rg`,
  filtrando por `data.agent_id === userId`.
- `AppDB.rg` é congelado: leitura zerada, writes redirecionados (no `useOfflineMutation`
  e no `syncEngine`) para `OfflineDB.boletins_rg`. Migration one-shot esvazia o store.
- **Trabalho / Pendências**: mantêm cache `AppDB`, mas passam pelo mesmo `reconcile()`
  da Fase C para ganhar remoção de órfãos e logs unificados.
- **Imóveis**: padronizar em `OfflineDB.properties`; `AppDB.properties` vira somente leitura
  e é esvaziado em migração futura (fora do escopo desta fase).

## Critério de pronto da Fase A

- [x] Todas as stores listadas.
- [x] Todos os pares leitura/escrita identificados.
- [x] Caches paralelos a remover marcados explicitamente.
