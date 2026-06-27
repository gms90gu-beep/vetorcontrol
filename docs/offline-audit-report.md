# Offline Audit Report

> Gerado automaticamente por `scripts/audit-offline.ts` em 2026-06-27T14:12:24.161Z

## Resumo

| Métrica | Valor |
|---|---|
| Arquivos varridos | 232 |
| Arquivos com `supabase.from/.rpc` | 26 |
| Server-only (ignorados) | 8 |
| **Client com fallback** | **18** |
| **Client SEM fallback** | **0** |

Score: **100%**

## ❌ Sem fallback (prioridade alta)

_Nenhum._

## ✅ Com fallback

- `src/components/DailyWorkCloser.tsx`
- `src/components/coordination/MunicipalIntelligence.tsx`
- `src/components/reports/ReportsDashboard.tsx`
- `src/components/reports/ReportsFilters.tsx`
- `src/components/supervision/AdminMasterDashboard.tsx`
- `src/components/supervision/CoordinatorDashboard.tsx`
- `src/components/supervision/OperationalDashboard.tsx`
- `src/components/supervision/SupervisionDashboard.tsx`
- `src/hooks/useAuth.tsx`
- `src/lib/geolocation.ts`
- `src/routes/_authenticated.admin.cycle-audit.tsx`
- `src/routes/_authenticated.admin.dashboard.tsx`
- `src/routes/_authenticated.admin.data-audit.tsx`
- `src/routes/_authenticated.admin.rg-reconcile.tsx`
- `src/routes/_authenticated.field-work.tsx`
- `src/routes/_authenticated.property.$propertyId.tsx`
- `src/routes/_authenticated.rg.editar.$id.tsx`
- `src/routes/_authenticated.rg.tsx`

## Como corrigir

1. Substituir `supabase.from('x').select()` por `listRemoteOrCache({ name: 'x', remote: () => supabase.from('x').select() })` (de `@/lib/offline/repos`).
2. Para escritas, usar `createOffline / updateOffline / deleteOffline` em vez de `supabase.from(...).insert`.
3. Para chamadas pontuais sem repo dedicado, envolver em `safeFetch(remote, fallback, { label })`.
