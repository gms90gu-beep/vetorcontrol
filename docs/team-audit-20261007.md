# Auditoria de agente e supervisor — 07/10/2026

## Ambiente

Mantido exclusivamente o projeto Cloud autorizado `ttjzgszxrnmcsygtzfcu`. Nenhuma troca de credenciais, cópia de dados ou reconstrução histórica foi executada nesta auditoria.

## Alterações

- Permissões e paginação: `src/lib/team-scope.ts`, `permitted-agents.ts`, `query-pages.ts`, `confirmed-focus.ts`, `reports-reconcile-policy.ts`, `reports-reconcile.functions.ts` e `wave-c.functions.ts`.
- Relatórios: `ReportsDashboard.tsx`, `ReportsFilters.tsx`, rotas `reports` e `relatorios`.
- Supervisão: `SupervisionDashboard.tsx`, `OperationalDashboard.tsx` e calendário de produção.
- Mapas: `OperationalMapView.tsx`, rotas `map` e `heatmap`; ciclo e agente são enviados às consultas, foco observado não é promovido automaticamente a positivo, limite de 5.000 imóveis com aviso de truncamento.
- Pendências: rotas `pending` e `admin.pendencias`, filtros de ciclo/semana e isolamento da equipe também no fallback local.
- Offline: `src/lib/offline/sync.ts`, dependências sessão → visita → tentativa de recuperação; ajuste de contador em `DailyWorkCloser.tsx`.
- Documentação: `AGENTS.md`, `roadmap.md` e este relatório.

## Migration aplicada

`drizzle/migrations/0007_scope_daily_rebuild_to_supervisor_team.sql`: valida vínculo de supervisor na função SQL de reconstrução, restringe a consulta à equipe e remove execução anônima. Não executa reconstrução nem modifica registros de produção. Marcador `[DWR_TEAM_AUTH]` e permissões conferidos na função instalada.

## Validação

- 96 testes aprovados em 25 arquivos: unidade, integração e offline.
- Novos testes de papéis `agent`/`agente`, equipe do supervisor, coordenador/admin global, consultas paginadas, foco confirmado e rejeição de reconstrução antes de acesso privilegiado.
- Compilação automática da prévia: `build OK`, última confirmação após as alterações de 10:17 UTC.
- Navegação autenticada real como agente: painel, calendário e relatórios carregaram sem erros de execução; mapa gerencial corretamente indisponível para agente.
- Chamada real de reconstrução para outro agente rejeitada, sem escrita.
- Contagens antes/depois da validação: 1.133 visitas, 61 registros diários, 128 pendências e 158 tentativas, sem variação.

## Pendências que impedem publicação

- A sessão disponível é de agente. Falta validar na interface uma conta de supervisor, os três atalhos filtrados, mapa e calor por ciclo/equipe e relatório gerencial. Não foram simulados papéis em armazenamento local nem alterados vínculos para testar.
- O último pedido de publicação anterior foi bloqueado por alerta crítico de leitura ampla das configurações. Essa política não foi alterada nem o alerta ignorado nesta auditoria.
- Não foi gravada visita fictícia para comprovar fechamento/sincronização real. Essa validação depende de uma operação real autorizada.
- Os 28 pares históricos anteriormente identificados continuam sem reconstrução, aguardando autorização específica.

Publicação não executada: a validação completa exigida ainda não foi atingida.