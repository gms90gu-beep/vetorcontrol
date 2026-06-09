# Fase 2 — Modo Offline Real (Pattern Repository)

## Problema atual

A infraestrutura existe (Dexie + SyncEngine + Badge), mas as telas continuam chamando `supabase.from(...)` diretamente. Sem internet, essas chamadas falham com **"Failed to fetch"** e a tela quebra.

## Estratégia

Criar uma camada de **repositórios** com o pattern:

```
online  → busca Supabase, hidrata Dexie, retorna dado fresco
offline → lê apenas Dexie, retorna dado em cache
write   → grava Dexie + enfileira mutação (independente do estado de rede)
```

E envolver toda chamada Supabase remanescente num helper `safeFetch()` que:
- Detecta offline (`navigator.onLine === false` ou `TypeError: Failed to fetch`)
- Loga `[OFFLINE] ...` em vez de quebrar
- Mostra toast "Modo Offline Ativo — dados do armazenamento local"
- Nunca propaga "Failed to fetch" para o usuário

## Entregas

### 1. Helpers base
- `src/lib/offline/safe-fetch.ts` — wrapper `safeFetch<T>(remoteFn, fallbackFn)`:
  - se `navigator.onLine` → tenta remoto; em erro de rede, cai no fallback
  - se offline → vai direto no fallback
  - logs `[OFFLINE] Lendo Dexie`, `[OFFLINE] Acesso Supabase bloqueado`, `[SYNC] ...`
- `src/lib/offline/toast-offline.ts` — utilitário para mostrar 1x a cada N segundos "Modo Offline Ativo".

### 2. Repositórios (por domínio)
`src/lib/offline/repos/`:
- `properties.repo.ts` — list por bloco, get por id, create/update/delete
- `blocks.repo.ts`
- `boletins.repo.ts`
- `visits.repo.ts` + `visit-deposits.repo.ts`
- `pendencies.repo.ts`
- `sessions.repo.ts` (field_work_sessions, daily_work_records)

Cada repo expõe: `list(filter?)`, `get(id)`, `create(p)`, `update(id,p)`, `remove(id)`.
Reads = `safeFetch(supabase, dexie)`; writes = Dexie + `enqueueMutation`.

### 3. Telas migradas para usar repos / safeFetch
- `src/routes/_authenticated.dashboard.tsx`
- `src/routes/_authenticated.field-work.tsx`
- `src/routes/_authenticated.field-work-list.tsx`
- `src/routes/_authenticated.property.$propertyId.tsx`
- `src/routes/_authenticated.rg.tsx` + `_authenticated.rg.editar.$id.tsx` + `_authenticated.rg.boletim.$id.tsx`
- `src/routes/_authenticated.pending.tsx`
- `src/routes/_authenticated.relatorios.tsx` (read-only — só fallback Dexie + aviso)
- `src/components/DailyWorkCloser.tsx`

### 4. Tratamento global de erro de rede
- `src/lib/error-capture.ts` — interceptar `TypeError: Failed to fetch` e mostrar toast amigável; nunca crashar.

### 5. Logs temporários
Console-only, prefixos:
- `[OFFLINE] Lendo Dexie (<tabela>)`
- `[OFFLINE] Acesso Supabase bloqueado`
- `[SYNC] Pendências locais: <n>`
- `[SYNC] Sincronização concluída — <n> ok, <n> falhou`

## Fora de escopo

- PWA / Service Worker (Fase 3)
- Conflict resolution avançada (mantém last-write-wins)
- GPS / mapas

## Resultado esperado

- Com rede: comportamento idêntico ao atual, com hidratação extra do Dexie.
- Sem rede: telas listadas continuam funcionando lendo Dexie; nenhuma exibe "Failed to fetch"; mutações ficam na fila e sincronizam quando voltar.

Quer que eu siga implementando tudo de uma vez, ou prefere começar pelas telas críticas (Trabalho + Visita + RG) e expandir depois?