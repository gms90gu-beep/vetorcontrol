# Estabilização Offline e Consistência de Dados

Objetivo: eliminar divergências entre **RG**, **Trabalho**, **Pendências**, **cache local** e **Supabase**, garantindo o mesmo comportamento online e offline.

Princípio único: **1 módulo = 1 tabela servidor = 1 store local oficial**.

---

## Fase A — Auditoria da arquitetura offline (entregável: mapa de fluxo)

Mapear, em `docs/offline-architecture.md`, todas as fontes de dados atuais:

- Stores Dexie hoje em uso
  - `AppDB.rg`
  - `OfflineDB.boletins_rg`
  - `OfflineDB.field_work_records`
  - `OfflineDB.pending_records`
  - quaisquer outras descobertas no scan
- Para cada store registrar:
  - quem **lê** (hooks, rotas, componentes)
  - quem **escreve** (mutations, sync, cleanup)
  - tabela Supabase correspondente
  - se é cache primário, secundário ou legado

Saída esperada:

```text
Módulo        Servidor              Cache oficial           Caches paralelos (a remover)
RG            boletins_rg           OfflineDB.boletins_rg   AppDB.rg
Trabalho      field_work_records    OfflineDB.field_work_records   —
Pendências    pending_records       OfflineDB.pending_records      —
```

Critério de pronto: o mapa lista TODOS os pares leitura/escrita e marca claramente os caches a desativar.

---

## Fase B — Fonte única de verdade

Para cada módulo, eleger o cache oficial e **eliminar** os paralelos.

Decisões propostas (a confirmar após a auditoria):

- **RG** → cache oficial: `OfflineDB.boletins_rg`. Desativar `AppDB.rg` (legado do `useRGRecords`).
- **Trabalho** → cache oficial: `OfflineDB.field_work_records`.
- **Pendências** → cache oficial: `OfflineDB.pending_records`.

Ações:

1. Refatorar `useRGRecords` para ler/escrever **apenas** em `OfflineDB.boletins_rg`, filtrado por `agent_id = userId`.
2. Remover writes em `AppDB.rg` em todo o código (cleanup + migration `rg_cache_v2_drop_appdb`).
3. Garantir que telas RG e Trabalho leiam do mesmo store de boletins → mesmos quarteirões nas duas telas.
4. Adicionar invariante de runtime: `assertSingleSource(module)` que loga erro se houver write fora do cache oficial.

Critério de pronto: `grep` pelo store legado retorna 0 ocorrências fora da migration de limpeza.

---

## Fase C — Engine de reconciliação automática

Criar `src/lib/offline/reconciler.ts` com a assinatura:

```ts
reconcile({
  module: 'rg' | 'work' | 'pendencies',
  userId: string,
  serverRows: Row[],
  localStore: Table,
}): Promise<ReconcileReport>
```

Operações executadas em ordem determinística:

1. **Inserir faltantes** — IDs presentes no servidor e ausentes localmente → `bulkPut`.
2. **Atualizar divergentes** — comparar `updated_at`; servidor mais novo vence; local mais novo entra em fila de upload pendente.
3. **Remover órfãos** — registros locais do `userId` que não existem mais no servidor → `bulkDelete` (apenas quando online + fetch OK).
4. **Registrar conflitos** — gravar em `OfflineDB.sync_conflicts` (nova store): `{id, module, reason, localRow, serverRow, ts}`.

Gatilhos:
- Após cada fetch do hook (`useRGRecords`, `useWorkRecords`, `usePendencyRecords`).
- Ao voltar de offline → online (`window.addEventListener('online', ...)`).
- Manual via botão "Reconciliar agora" na tela `/admin/rg-pipeline`.

Logs unificados com prefixo por módulo, ex.:
```
[RECONCILE:rg] userId=… server=11 local=9 inserted=2 updated=0 deleted=0 conflicts=0
```

Critério de pronto:
- `Servidor == Local == Renderizado` em RG, Trabalho e Pendências para o usuário Gustavo (11 boletins).
- Nenhum quarteirão desaparece da tela enquanto existir no Supabase.
- Troca de usuário não mistura registros (cache filtrado por `userId`).
- Modo offline mantém os últimos dados reconciliados e exibe banner "Dados de DD/MM HH:mm".

---

## Detalhes técnicos

**Novos arquivos**
- `src/lib/offline/reconciler.ts` — engine genérica.
- `src/lib/offline/sync-conflicts.ts` — store Dexie + helpers.
- `src/routes/_authenticated.admin.rg-pipeline.tsx` — painel de diagnóstico (Servidor / Local / Renderizado / Conflitos / botão Reconciliar).
- `docs/offline-architecture.md` — mapa entregue na Fase A.

**Arquivos refatorados**
- `src/hooks/useOfflineData.ts` — `useRGRecords`, `useWorkRecords`, `usePendencyRecords` passam a delegar ao `reconciler`.
- `src/routes/_authenticated.rg.tsx` e `src/routes/_authenticated.trabalho.tsx` — leitura única via hook refatorado.

**Migration de limpeza (one-shot via localStorage flag `offline_v2_migration`)**
- Esvazia `AppDB.rg`.
- Reinjeta dados a partir de `OfflineDB.boletins_rg` filtrado por `userId`.
- Executa `reconcile()` inicial.

**Sem alterações no banco** — toda a Fase C é client-side. Schema Supabase permanece intocado.

---

## Ordem de execução

1. Fase A (mapa) — sem código de produção, só documentação.
2. Fase B (cache único RG) — refatorar `useRGRecords` + migration de limpeza.
3. Fase B (Trabalho + Pendências) — mesma refatoração nos outros hooks.
4. Fase C (reconciler + painel admin) — engine genérica plugada nos três hooks.
5. Validação Gustavo: `Servidor=11 / Local=11 / Renderizado=11` em RG **e** Trabalho.

Nada novo de produto entra antes do passo 5 passar.
