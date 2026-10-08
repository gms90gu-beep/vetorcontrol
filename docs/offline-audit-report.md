# Offline Audit Report

> Gerado automaticamente por `scripts/audit-offline.ts` em 2026-10-08T02:38:17.123Z

## Resumo

| Métrica | Valor |
|---|---|
| Arquivos varridos | 295 |
| Arquivos com `supabase.from/.rpc` | 39 |
| Server-only (ignorados) | 10 |
| **Client com fallback** | **25** |
| **Client SEM fallback** | **4** |

Score: **86%**

## ❌ Sem fallback (prioridade alta)

- `src/lib/operational-metrics.ts` — linhas 292, 331, 332, 340
- `src/lib/session-state.ts` — linhas 244, 246, 354, 355, 357
- `src/routes/_authenticated.calendario-producao.tsx` — linhas 127
- `src/routes/_authenticated.settings.tsx` — linhas 74, 75

## ✅ Com fallback

- `src/components/DailyWorkCloser.tsx`
- `src/components/coordination/MunicipalIntelligence.tsx`
- `src/components/field-work/OpenSessionModal.tsx`
- `src/components/field-work/OperationalPanel.tsx`
- `src/components/reports/ReportsDashboard.tsx`
- `src/components/reports/ReportsFilters.tsx`
- `src/components/supervision/AdminMasterDashboard.tsx`
- `src/components/supervision/CoordinatorDashboard.tsx`
- `src/components/supervision/OperationalDashboard.tsx`
- `src/components/supervision/SupervisionDashboard.tsx`
- `src/hooks/useAuth.tsx`
- `src/lib/geolocation.ts`
- `src/lib/permitted-agents.ts`
- `src/routes/_authenticated.admin.cycle-audit.tsx`
- `src/routes/_authenticated.admin.dashboard.tsx`
- `src/routes/_authenticated.admin.data-audit.tsx`
- `src/routes/_authenticated.admin.pendencias.tsx`
- `src/routes/_authenticated.admin.rg-reconcile.tsx`
- `src/routes/_authenticated.field-work-list.tsx`
- `src/routes/_authenticated.field-work.tsx`
- `src/routes/_authenticated.minhas-jornadas.tsx`
- `src/routes/_authenticated.pending.tsx`
- `src/routes/_authenticated.property.$propertyId.tsx`
- `src/routes/_authenticated.rg.boletim.$id.tsx`
- `src/routes/_authenticated.rg.editar.$id.tsx`

## Como corrigir

1. Substituir `supabase.from('x').select()` por `listRemoteOrCache({ name: 'x', remote: () => supabase.from('x').select() })` (de `@/lib/offline/repos`).
2. Para escritas, usar `createOffline / updateOffline / deleteOffline` em vez de `supabase.from(...).insert`.
3. Para chamadas pontuais sem repo dedicado, envolver em `safeFetch(remote, fallback, { label })`.
