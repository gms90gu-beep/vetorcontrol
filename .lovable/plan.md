## Módulo de Pendências e Recuperação de Imóveis

Fluxo profissional para recuperar imóveis fechados, recusados, ausentes ou não localizados — com histórico de tentativas, mapa, indicadores, relatórios e auditoria.

### 1. Banco de dados (migration única)

**Nova tabela `property_recovery_attempts`** (histórico imutável de tentativas):
- `property_id`, `visit_id` (opcional), `agent_id`, `attempt_number`, `result` (enum: `closed`, `refused`, `absent`, `not_located`, `not_done`, `visited`, `unoccupied`, `demolished`), `notes`, `latitude`, `longitude`, `attempted_at`, `created_at`.
- RLS: agente vê suas próprias, supervisores via `can_supervise_user`. Sem UPDATE/DELETE (imutável → auditoria).
- Índices: `(property_id)`, `(agent_id, attempted_at desc)`.

**Nova tabela `property_pendencies`** (estado atual, 1 por imóvel):
- `property_id` UNIQUE, `agent_id`, `current_status` (mesmo enum acima), `attempt_count`, `last_attempt_at`, `reason`, `resolved_at`, `resolved_status`.
- Trigger: quando uma visita ou tentativa registra resultado em `[closed, refused, absent, not_located, not_done]` → upsert pendência + incrementa contador. Quando resultado em `[visited, unoccupied, demolished]` → marca `resolved_at` e remove da lista ativa (mantém linha para histórico).
- RLS por agente/supervisor.

**Extensão `properties.status`** (enum `property_status`): adicionar `unoccupied`, `demolished`, `visited` se não existirem.

**View `v_property_pendencies_full`** juntando propriedade + último attempt + contagem para listagens.

### 2. Server functions (`src/lib/pendencies.functions.ts`)

- `listPendencies({ scope, filters })` — agente vê suas; supervisor vê equipe; coordenador vê tudo. Filtros: agente, área, quarteirão, ciclo, status.
- `getPendencyDetail(propertyId)` — propriedade + todas as tentativas ordenadas.
- `recordRecoveryAttempt({ propertyId, result, notes, lat, lng })` — insere em `property_recovery_attempts`; trigger atualiza pendência e propriedade. Se `result = visited` cria também `visits` row normal (atualiza BRG/indicadores).
- `getPendencyKpis({ scope, filters })` — totais por status.
- `exportPendenciesPdf` / `exportPendenciesExcel`.

Todas com `requireSupabaseAuth`.

### 3. UI — nova rota `/pendencias`

Arquivo `src/routes/_authenticated.pendencias.tsx` (substitui o atual `pending.tsx` mock):
- **Header com KPIs**: Total, Fechados, Recusados, Ausentes, Recuperados, Desocupados, Demolidos.
- **Filtros**: por papel — agente (nenhum), supervisor (agente, área, quarteirão), coordenador (+ equipe, supervisor, ciclo).
- **Tabs**: Lista | Mapa.
- **Lista**: cards com nº, logradouro, quarteirão, motivo, agente, nº tentativas, data última tentativa. Click → abre `Sheet` de detalhes.
- **Sheet de detalhes**:
  - Cabeçalho do imóvel + situação atual.
  - Timeline de tentativas (data, hora, agente, resultado, observação).
  - Botão **🔄 Realizar Nova Tentativa** → modal com select de resultado (Recuperado/Visitado, Continua Fechado, Recusado, Desocupado, Demolido) + observação + geolocalização opcional.
  - Botões de exportar PDF/Excel da pendência individual.
- **Mapa**: usa `_authenticated.map.tsx` como base; marcadores coloridos por situação (fechado=âmbar, recusado=vermelho, ausente=cinza).

### 4. Menu de navegação

Adicionar item **📌 Pendências** no menu principal do agente/supervisor/coordenador, próximo a Trabalho/RG/Mapa/Meu Desempenho. Identificar shell de navegação atual e injetar link.

### 5. Alerta no Dashboard do agente

Em `src/components/agent/AgentDashboard.tsx`, adicionar card no topo (acima do CTA de jornada) quando `pendingCount > 0`:
- Banner vermelho com **🔴 Pendências para Recuperar: N** → onClick navega para `/pendencias`.
- Query: `pendencies` do agente com `resolved_at IS NULL`.

### 6. Integração com fluxo de visita existente

No registro de visita (rota `_authenticated.property.$propertyId.tsx` e `PropertyVisitButtons.tsx`):
- Após salvar visita com status `closed/refused/absent`, chamar `recordRecoveryAttempt` automaticamente (ou deixar o trigger DB fazer baseado em `visits.status`).
- Preferência: trigger no DB sobre `visits` insert → garante consistência mesmo em fluxos antigos.

### 7. Relatórios

Botões "Exportar PDF" / "Exportar Excel" na tela de Pendências chamando as server fns; PDF via `src/lib/pdf-generator.ts` (já existe), Excel via `xlsx` (instalar se faltar).

### 8. Auditoria

Toda tentativa grava `agent_id`, `attempted_at`. Inserir também linha em `audit_log` via trigger (`action='recovery_attempt'`, metadata com resultado).

### Detalhes técnicos

- **Enum SQL**: `CREATE TYPE recovery_result AS ENUM (...)`.
- **Trigger principal**: `AFTER INSERT ON property_recovery_attempts` → upsert em `property_pendencies` + update `properties.status` quando aplicável + insert em `audit_log`.
- **Trigger secundário**: `AFTER INSERT ON visits` → se `status IN ('closed','refused')` insere `property_recovery_attempts` automaticamente (com `visit_id`), evitando duplicar lógica no client.
- **GRANTS** completos: `authenticated` + `service_role` em todas as novas tabelas.
- **RLS** baseada em `can_supervise_user(agent_id)` (já existe).

### Ordem de implementação

1. Migration (tabelas, enums, triggers, RLS, grants).
2. Server functions de leitura + KPIs.
3. Rota `/pendencias` (lista + KPIs + filtros básicos por papel).
4. Sheet de detalhes + timeline + modal de nova tentativa.
5. Card de alerta no AgentDashboard.
6. Item no menu de navegação.
7. Aba Mapa de pendências.
8. Exportação PDF/Excel.
9. Auditoria (trigger audit_log).

### Observações

- O `_authenticated.pending.tsx` atual usa dados mock e será substituído pela nova rota `/pendencias` (mantenho `/pending` redirecionando para `/pendencias` para não quebrar links).
- Status `visited` em `properties` indica recuperação concluída; o histórico de tentativas permanece consultável mesmo após resolução.
- Sem alterações em `auth`, `storage`, `realtime`, `vault`.

Aguardo aprovação para começar pela migration.