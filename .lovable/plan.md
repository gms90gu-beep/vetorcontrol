# Fases D–G — Estabilização Final do Pipeline RG

Continuação do plano "Estabilização Offline". Fases A–C já entregues
(`reconciler.ts`, `/admin/rg-pipeline` básico, `useRGRecords` refatorado).

Princípio mantido: **1 módulo = 1 tabela servidor = 1 store local oficial**.

---

## Fase D — Painel `/admin/rg-pipeline` expandido

Refatorar `src/routes/_authenticated.admin.rg-pipeline.tsx` para exibir
contadores cruzados em três níveis:

```text
Visão               Servidor   Oficial   Legado   Renderizados
Total (usuário)     N          N         0        N
Por agente          tabela com 1 linha por agent_id
Por boletim         tabela id_boletim · servidor · local · render
Por quarteirão      tabela block_id · servidor · local · render
```

Detalhes:
- Seletor "Escopo": `meu usuário` (default) ou `todos` (apenas admin/coordenador via `has_role`).
- Fontes:
  - Servidor: `supabase.from('boletins_rg').select('id,agent_id,block_id,updated_at')`.
  - Oficial: `offlineDb.boletins_rg.toArray()`.
  - Legado: `appDb.rg.count()` + amostra dos 5 primeiros para diagnóstico.
  - Renderizados: contagem via `useRGRecords({ scope })` montado no painel.
- Botões: **Atualizar**, **Reconciliar agora**, **Limpar conflitos**, **Executar limpeza (Fase E)**.
- Status pill verde quando `servidor == oficial == render` em todas as linhas.

Critério de pronto: divergência em qualquer nível aparece destacada em
amarelo com o `id` que falta.

---

## Fase E — Limpeza de fantasmas (migração one-shot)

Novo arquivo `src/lib/offline/cleanup-ghosts.ts`:

```ts
export async function cleanupGhosts(userId: string): Promise<GhostReport>
```

Etapas, em ordem, dentro de uma única transação Dexie:
1. **sem userId / agent_id** → remover linhas de `boletins_rg`, `field_work_records`, `pending_records` cujo `data.agent_id` é falsy.
2. **duplicados** → para mesmo `id`, manter a de `updated_at` mais novo.
3. **órfãos do usuário atual** → IDs locais ausentes no servidor (reusa `reconcile()` com `serverRows` recém-buscados).
4. **inconsistentes** → linhas sem `block_id` ou sem `record_date` (campos obrigatórios do schema).
5. **legado** → `appDb.rg.clear()` se ainda houver registros.

Gatilho: botão "Executar limpeza" no painel + flag `offline_v2_cleanup_ghosts` no `localStorage` para garantir execução única automática no boot.

Saída (`GhostReport`):
```ts
{ removedNoOwner, removedDuplicates, removedOrphans, removedInconsistent, clearedLegacy, ts }
```
Persistir último relatório em `offlineDb.meta` chave `cleanup:last`.

Critério de pronto: rodar duas vezes seguidas → segunda execução retorna todos contadores em 0.

---

## Fase F — Auditoria territorial

Novo arquivo `src/lib/audit/territory.ts` com função `auditTerritory(userId)`:

Para cada `block_id` referenciado em `boletins_rg` do usuário, validar:
- existe em `blocks`?
- tem ao menos 1 `properties` ligado?
- aparece no cache local (`offlineDb.blocks`)?

Saída: lista `{ block_id, inServer, inProperties, inLocal, renderedCount }`.

Exibir no painel (`Fase D`) como aba "Auditoria territorial". Realçar em
vermelho qualquer `block_id` com `inServer=true` mas `renderedCount=0` —
é exatamente o caso "quarteirão sumiu da tela mas existe no banco".

Sem mudanças de schema. Sem migração SQL.

Critério de pronto: para Gustavo, todos os 11 boletins têm linha verde
(server + properties + local + render).

---

## Fase G — Teste operacional multi-agente

Adicionar no painel um modo **"Snapshot operacional"** que, quando
acionado por um admin, percorre uma lista fixa de `user_id`s
(`Gustavo`, `Marineide`, `Maria Olga` — IDs configurados em
`src/lib/audit/operational-agents.ts`) e gera tabela:

```text
Agente         Servidor   Offline   Render   Status
Gustavo        11         11        11       ✓
Marineide      …          …         …        …
Maria Olga     …          …         …        …
```

`Offline` é simulado: aplicar `reconcile()` com `serverRows = cache local`
para detectar drift sem precisar derrubar a rede.

Critério de pronto: três linhas verdes simultâneas → fechar épico.

---

## Detalhes técnicos

**Arquivos novos**
- `src/lib/offline/cleanup-ghosts.ts`
- `src/lib/audit/territory.ts`
- `src/lib/audit/operational-agents.ts`

**Arquivos refatorados**
- `src/routes/_authenticated.admin.rg-pipeline.tsx` — abas: *Resumo*, *Por agente*, *Por boletim*, *Por quarteirão*, *Auditoria territorial*, *Snapshot operacional*.
- `src/hooks/useOfflineData.ts` — `useRGRecords` aceita `{ scope: 'self' | 'all' }` para alimentar o painel.

**Sem alterações no banco.** Toda a Fase D–G é client-side.

---

## Ordem de execução

1. Fase D — painel multi-nível.
2. Fase E — `cleanupGhosts` + botão + auto-trigger one-shot.
3. Fase F — `auditTerritory` + aba.
4. Fase G — snapshot multi-agente.
5. Validação final: três agentes em verde → encerrar épico.

Nada novo de produto entra antes do passo 5 passar.
