# Inventário do backend atual (somente leitura) — 16/09/2026

Backend inventariado: projeto `ttjzgszxrnmcsygtzfcu` (Lovable Cloud / Supabase gerenciado).
Nenhum dado, tabela, política ou credencial foi alterado. Nenhum SQL de escrita executado.

## Arquivos gerados

- `docs/migration/schema-only.sql` — estrutura completa do schema `public` (sem dados, sem GRANTs).
- `docs/migration/schema-only-with-grants.sql` — mesma estrutura incluindo GRANTs (necessários no Supabase de destino).

Ambos contêm: tipos ENUM, tabelas, colunas/defaults, PK/FK/UNIQUE/CHECK, views,
funções, triggers, índices, RLS e políticas. Verificado: 0 linhas de `COPY`/`INSERT INTO`
de dados e nenhuma senha, service-role key, JWT secret ou token.

## Resumo estrutural (schema public)

| Item | Quantidade |
| --- | --- |
| Tabelas | 32 |
| Views | 3 (`annual_report_summary`, `cycle_coverage_summary`, `keep_alive_status`) |
| Tipos ENUM | 10 |
| Funções / RPCs | 66 |
| Triggers (não internos) | 42 |
| Índices | 79 (37 explícitos + índices de constraints) |
| Políticas RLS | 70 |
| GRANTs | 324 |

### ENUMs

- `activity_type`: routine, infestation_survey, pending
- `app_role`: admin, supervisor, agent, admin_master, coordenador, agente
- `block_status`: not_started, in_progress, completed
- `cycle_status`: not_started, in_progress, finished
- `property_status`: active, pending, deactivated, absent, not_located, unoccupied, demolished, visited
- `property_type`: residence, commerce, vacant_lot, strategic_point, others
- `recovery_result`: closed, refused, absent, not_located, not_done, visited, unoccupied, demolished
- `user_role_type`: admin_master, coordenador, supervisor, agente
- `visit_status`: visited, closed, refused, abandoned
- `week_status`: open, closed

### RLS

Todas as 32 tabelas têm RLS habilitado, exceto `supabase_keep_alive` (RLS desligado —
revisar no destino).

## Contagem de registros por tabela

| Tabela | Registros |
| --- | --- |
| agents | 10 |
| areas | 1 |
| audit_log | 266 |
| block_progress | 33 |
| blocks | 38 |
| boletins_rg | 37 |
| cycles | 6 |
| daily_work_records | 50 |
| data_audit_snapshots | 0 |
| field_work_records | 0 |
| field_work_sessions | 154 |
| localities | 1 |
| pending_records | 0 |
| profiles | 10 |
| properties | 1265 |
| property_pendencies | 121 |
| property_recovery_attempts | 144 |
| rg_ocr_imports | 0 |
| rg_pdf_exports | 0 |
| rg_records | 0 |
| rg_uploads | 3 |
| streets | 0 |
| subareas | 1 |
| supabase_keep_alive | 10 |
| system_settings | 1 |
| user_roles | 10 |
| vehicles | 0 |
| visit_deposits | 335 |
| visits | 1042 |
| visits_backfill_report | 0 |
| weekly_bulletins | 0 |
| weeks | 48 |

Total aproximado: 3.643 registros.

## Auth

- Usuários em `auth.users`: **10**
- Migração de usuários exige export/import de `auth.users` no destino (senhas em hash),
  mantendo os mesmos UUIDs, pois `profiles.id`, `user_roles.user_id`, `visits.agent_id`
  e outras colunas referenciam esses IDs.

## Storage — buckets

| Bucket | Público | Limite de tamanho | MIME permitidos |
| --- | --- | --- | --- |
| rg-pdfs | não | sem limite | sem restrição |
| rg-ocr | não | sem limite | sem restrição |
| block-reports | não | sem limite | sem restrição |

As políticas de `storage.objects` não entram no dump do schema `public`; precisam ser
recriadas manualmente no destino (constam nas migrações do repositório).

## Edge Functions

- `supabase/functions/manage-agents` — única Edge Function no repositório.
- Demais lógicas de servidor rodam como server functions do app (TanStack), não como Edge
  Functions; endpoint público: `src/routes/api/public/auth-login.ts`.

## Histórico de migrações

`supabase/migrations/` contém 110 arquivos, o mais recente
`20260916161013_*.sql`. Alternativa de migração: aplicar as migrações em ordem no destino,
em vez do dump de estrutura.

## Pontos de atenção para o destino

1. Aplicar os GRANTs (arquivo `schema-only-with-grants.sql`), senão a API de dados não lê
   as tabelas mesmo com RLS correto.
2. Recriar buckets e políticas de Storage.
3. Importar `auth.users` preservando UUIDs antes de importar os dados.
4. Extensões necessárias (`pgcrypto`, `pg_cron` se usado) devem existir no destino.
5. `supabase_keep_alive` sem RLS — decidir se mantém.
