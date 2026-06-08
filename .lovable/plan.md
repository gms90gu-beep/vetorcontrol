## Plano de Otimização de Performance

Otimizar tudo de uma vez é arriscado (regressões em jornada, RG, pendências). Proponho execução **em fases**, validando cada uma antes da próxima.

---

### Fase 1 — Ganhos rápidos e seguros (recomendo começar aqui)

**1.1 Queries Supabase — remover `select('*')`**
- Auditar e substituir `select('*')` por colunas explícitas em:
  - `AgentDashboard` (visits hoje/semana/mês)
  - `field-work-list`, `pending`, `rg`, `property/$propertyId`
  - Componentes de relatórios
- Risco: baixo. Ganho: reduz payload em 40-70%.

**1.2 Cache de sessão/perfil/role**
- Hoje `useAuth` já mantém user, mas `profile`, `role` e `jornada ativa` são re-buscados em várias telas.
- Criar um `QueryClient` provider com keys: `['profile', userId]`, `['active-session', userId]`, `['current-cycle']` com `staleTime: 5min`.
- Risco: médio (precisa invalidar nos pontos certos: login/logout, fechar jornada).

**1.3 Lazy loading do Dashboard**
- Dividir o `useEffect` monolítico do `AgentDashboard` em queries independentes (TanStack Query) que carregam em paralelo, não em sequência.
- Histórico (`HistoryList`) só busca quando a aba é aberta (não no mount).
- Risco: baixo.

---

### Fase 2 — Paginação em listas

Aplicar `range()` do Supabase + scroll infinito ou paginação numérica em:
- `field-work-list` (imóveis)
- `pending` (pendências)
- `rg` (boletins)
- Relatórios de visitas
- Lista de quarteirões

Padrão: 20-30 itens por página. Risco: médio (mudança de UX, precisa testar filtros).

---

### Fase 3 — Pré-carregamento mobile (jornada)

Na tela `property/$propertyId`:
- Pré-buscar dados do `nextProperty` em background (TanStack Query `prefetchQuery`) assim que a tela atual carrega.
- Próximo quarteirão: pré-carregar quando faltar 1-2 imóveis para acabar o atual.

Risco: baixo (só adiciona prefetch, não muda fluxo).

---

### Fase 4 — Realtime granular e imagens

- Trocar listeners realtime que disparam refetch global por updates de query cache específicos (`queryClient.setQueryData`).
- Otimização de imagens: gerar variantes WebP via `vite-imagetools` para logos/banners estáticos. Fotos enviadas por usuários ficam como estão (precisaria pipeline server-side).

Risco: médio.

---

### Recomendação

Sugiro **executar Fase 1 agora** (mais retorno, menor risco), validar com você, e depois seguir para Fase 2. Posso também executar todas em sequência se preferir, mas o diff fica grande e o risco de regressão aumenta.

**Como deseja prosseguir?**
- (A) Só Fase 1 agora
- (B) Fases 1+2
- (C) Todas as 4 fases de uma vez
- (D) Outro escopo (me diga qual)
