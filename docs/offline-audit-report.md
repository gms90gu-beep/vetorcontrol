# Offline Audit Report

> Gerado automaticamente por `scripts/audit-offline.ts` em 2026-06-27T13:46:46.115Z

## Resumo

| Métrica | Valor |
|---|---|
| Arquivos varridos | 228 |
| Arquivos com `supabase.from/.rpc` | 40 |
| Server-only (ignorados) | 8 |
| **Client com fallback** | **8** |
| **Client SEM fallback** | **24** |

Score: **25%**

## ❌ Sem fallback (prioridade alta)

- `src/components/coordination/MunicipalIntelligence.tsx` — linhas 37, 38, 39, 40
- `src/components/reports/ReportsDashboard.tsx` — linhas 73, 167
- `src/components/reports/ReportsFilters.tsx` — linhas 51, 52, 53, 54
- `src/components/supervision/AdminMasterDashboard.tsx` — linhas 827
- `src/components/supervision/CoordinatorDashboard.tsx` — linhas 44, 54
- `src/hooks/useAuth.tsx` — linhas 78, 169
- `src/lib/offline/sync.ts` — linhas 67, 72, 84, 90, 96, 103…
- `src/lib/role-guards.ts` — linhas 36
- `src/routes/_authenticated.admin.cycle-audit.tsx` — linhas 53
- `src/routes/_authenticated.admin.dashboard.tsx` — linhas 47, 48, 49
- `src/routes/_authenticated.admin.data-audit.tsx` — linhas 156, 186, 198, 208, 211, 218…
- `src/routes/_authenticated.admin.design-system.tsx` — linhas 44
- `src/routes/_authenticated.admin.rbac-audit.tsx` — linhas 36
- `src/routes/_authenticated.admin.rg-reconcile.tsx` — linhas 39, 56
- `src/routes/_authenticated.admin.system-health.tsx` — linhas 42
- `src/routes/_authenticated.agente.tsx` — linhas 11
- `src/routes/_authenticated.coordenacao.tsx` — linhas 15
- `src/routes/_authenticated.coordenador.tsx` — linhas 11
- `src/routes/_authenticated.reports.tsx` — linhas 12
- `src/routes/_authenticated.supervision.tsx` — linhas 15
- `src/routes/_authenticated.supervisor.tsx` — linhas 11
- `src/routes/admin-master.tsx` — linhas 47
- `src/routes/login.tsx` — linhas 113
- `src/sync/syncEngine.ts` — linhas 95, 99, 104

## ✅ Com fallback

- `src/components/DailyWorkCloser.tsx`
- `src/components/supervision/OperationalDashboard.tsx`
- `src/components/supervision/SupervisionDashboard.tsx`
- `src/lib/geolocation.ts`
- `src/routes/_authenticated.field-work.tsx`
- `src/routes/_authenticated.property.$propertyId.tsx`
- `src/routes/_authenticated.rg.editar.$id.tsx`
- `src/routes/_authenticated.rg.tsx`

## Como corrigir

1. Substituir `supabase.from('x').select()` por `listRemoteOrCache({ name: 'x', remote: () => supabase.from('x').select() })` (de `@/lib/offline/repos`).
2. Para escritas, usar `createOffline / updateOffline / deleteOffline` em vez de `supabase.from(...).insert`.
3. Para chamadas pontuais sem repo dedicado, envolver em `safeFetch(remote, fallback, { label })`.
