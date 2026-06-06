## Reestruturação por Perfil

Objetivo: separar claramente o que cada perfil enxerga, removendo a "Inteligência Operacional" do Agente e criando experiências dedicadas para Supervisor e Coordenador.

---

### 1. PERFIL AGENTE — `/dashboard` (quando role = agente)

Remover bloco atual "Inteligência Operacional" e substituir por 4 seções:

**a) Meu Desempenho**
- Card "Produção de Hoje": imóveis trabalhados, fechados, recusas, focos, depósitos tratados, larvicidas aplicados
- Card "Produção da Semana": imóveis visitados, focos, recusas, quarteirões concluídos
- Fonte: tabela `visits` + `visit_deposits` filtrada por `agent_id = auth.uid()` e data

**b) Meta Operacional**
- Meta diária (configurável em `system_settings`, default 30 imóveis/dia)
- Produção atual do dia
- Percentual + barra de progresso (`<Progress>`)

**c) Meu Histórico** — Tabs: Hoje / Semana / Mês
- Lista agrupada de visitas do agente no período

**d) Minha Área**
- Quarteirão atual (último `field_work_sessions` ativo)
- Quarteirões concluídos / pendentes do agente
- Botão "Abrir Mapa" → `/map` filtrado

**Mapa do Agente (`/map`)**
- Mostrar apenas imóveis vinculados ao agente (via `boletins_rg.agent_id = auth.uid()` ou `visits.agent_id`)
- Pins: visitados (verde), focos (vermelho)

---

### 2. PERFIL SUPERVISOR — `/supervision`

Manter `SupervisionDashboard` atual e adicionar nova aba **"Dashboard Operacional"**:

- **Produção por Agente** (tabela): imóveis trabalhados, recusas, fechados, focos
- **Cobertura Territorial**: % por área e por ciclo
- **Ranking de Agentes**: produtividade diária e semanal (ordenado)
- **Pendências**: imóveis não visitados, quarteirões pendentes
- **Filtros**: agente, ciclo, semana, área
- **Relatórios**: botões "Exportar PDF" / "Exportar Excel"

Escopo de dados: apenas agentes onde `profiles.supervisor_id = auth.uid()` (já garantido por RLS via `can_supervise_user`).

---

### 3. PERFIL COORDENADOR — `/coordenacao`

Substituir `CoordinatorDashboard` por nova **Central de Inteligência Municipal** com tabs:

**a) Indicadores Gerais**
- Cobertura municipal, imóveis trabalhados, focos, recusas, fechados

**b) Cobertura por Bairro**
- % execução por bairro; destacar áreas críticas (< 50%)

**c) Indicadores por Supervisor**
- Produtividade da equipe de cada supervisor, comparativos

**d) Indicadores por Ciclo**
- Andamento e % concluído de cada ciclo

**e) Mapa Estratégico** (`/map?scope=municipal`)
- Focos, pendências, imóveis trabalhados, cobertura territorial

**f) Exportações**
- PDF consolidado, Excel consolidado

**g) Relatórios Gerenciais**
- Por área, supervisor, agente, ciclo

Escopo: agentes/supervisores onde `profiles.coordinator_id = auth.uid()` ou supervisores subordinados (já em RLS).

---

### 4. SEGURANÇA (RLS)

RLS atual já cobre os escopos via `can_supervise_user()` e `has_role()`. Nenhuma migração necessária — apenas garantir que as queries do frontend usem `select` sem bypass.

Adicionar `system_settings.daily_goal` (integer) se ainda não existir — migração simples.

---

### Arquivos afetados

- **Novo**: `src/components/agent/AgentDashboard.tsx` (Meu Desempenho, Meta, Histórico, Minha Área)
- **Novo**: `src/components/supervision/OperationalDashboard.tsx` (aba dentro de SupervisionDashboard)
- **Novo**: `src/components/coordination/MunicipalIntelligence.tsx`
- **Editado**: `src/routes/_authenticated.dashboard.tsx` (renderizar AgentDashboard quando role=agente)
- **Editado**: `src/components/supervision/SupervisionDashboard.tsx` (adicionar tab)
- **Editado**: `src/routes/_authenticated.coordenacao.tsx` (usar novo componente)
- **Editado**: `src/routes/_authenticated.map.tsx` (filtrar por role)
- **Migração**: adicionar `daily_goal` em `system_settings` (se necessário)

---

### Detalhes técnicos

- Reutilizar `useAuth()` para role-gating
- Queries via `supabase` client (RLS já filtra)
- Gráficos: usar `recharts` (já em `src/components/ui/chart.tsx`)
- Exportação PDF: reutilizar `src/lib/pdf-generator.ts`
- Exportação Excel: adicionar `xlsx` via `bun add xlsx`

### Perguntas antes de implementar

1. Meta diária do agente: usar valor fixo (ex: 30 imóveis/dia) ou criar campo configurável em `system_settings`?
2. Manter o conteúdo atual da seção "Inteligência Operacional" do Agente como referência ao mover para o Supervisor, ou pode ser reescrito do zero?
3. Exportação Excel: tudo bem adicionar a dependência `xlsx`?