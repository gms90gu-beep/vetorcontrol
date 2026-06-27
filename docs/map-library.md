# Biblioteca oficial de mapas (`@/components/map/shared`)

Toda renderização de mapas da aplicação passa por este módulo. Regra
fundamental: **nenhum componente fora desta pasta deve importar `leaflet`
diretamente**. Sempre componha a partir dos blocos abaixo.

## Blocos

| Componente / hook            | Responsabilidade                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `SharedMap`                  | Raiz. Cria a instância Leaflet, gerencia fases (`loading-data`/`ready`/`tile-error`/...), aplica tiles resilientes via `attachResilientTileLayer`, expõe a instância via contexto. |
| `SharedMarkerLayer`          | Camada de pontos. Classifica por `status` ou via `classifyProperty`. Cluster opcional. |
| `SharedLegend`               | Legenda padrão alimentada por `MARKER_COLORS`.                                               |
| `SharedLoading` / `SharedError` | Skeleton e variantes (`tile`, `data`, `no-geo`, `no-data`, `timeout`).                    |
| `useResilientTileLayer`      | Fallback automático Carto → OSM → Esri quando o provedor falha.                              |
| `useFitBounds`               | Ajusta o `fitBounds` quando os pontos mudam.                                                 |
| `useMapResize`               | `invalidateSize()` em redimensionamento do container.                                        |
| `useMarkerCluster`           | Cria e mantém um `MarkerClusterGroup` reativo aos pontos.                                    |
| `useMapEvents`               | Escuta eventos Leaflet com cleanup automático.                                               |
| `mapLogger`                  | Logger único: `mapLogger.info/warn/error("scope", "msg", meta)`.                             |

## Tokens semânticos (`MARKER_COLORS`)

- `focus` (#ef4444) — foco positivo
- `pendency` (#f97316) — pendência
- `strategic` (#3b82f6) — ponto estratégico
- `clean` (#10b981) — sem foco / regularizado
- `case` (#a855f7) — caso confirmado
- `valid` / `missing` / `invalid` / `duplicated` — auditoria de georef
- `unknown` (#94a3b8) — fallback

## Exemplo mínimo

```tsx
import { SharedMap, SharedMarkerLayer } from "@/components/map/shared";

<SharedMap
  height="60vh"
  loading={query.isLoading}
  loadError={query.isError ? "Falha ao carregar" : null}
  onRetryLoad={() => query.refetch()}
  isEmpty={points.length === 0}
  emptyVariant="no-geo"
>
  <SharedMarkerLayer points={points} />
</SharedMap>
```

## Mapas migrados

- `src/components/rg/BlockMapDialog.tsx`
- `src/components/map/GeorefAuditMap.tsx`
- `src/routes/_authenticated.heatmap.tsx`

## Pendente

- `src/components/map/OperationalMapView.tsx` — usa camadas customizadas
  (heatmap, polígonos de quarteirão, controle de base layers). Migração
  faseada: extrair `SharedHeatLayer` e `SharedPolygonLayer` antes.

## Testes

`src/components/map/shared/__tests__/` cobre fallback de tiles e
classificação de imóveis (`bunx vitest run`).
