# Georreferenciamento Inteligente dos Imóveis

Sistema que captura a localização GPS apenas na **primeira visita** de cada imóvel e a reutiliza nas próximas — sem rastrear o agente.

## 1. Banco de dados

Migração em `properties`:
- `latitude NUMERIC`
- `longitude NUMERIC`
- `geocoded_at TIMESTAMPTZ`
- `geocoded_by UUID` (referência ao agente que registrou — auditoria)

Índice composto `(latitude, longitude)` para consultas do mapa.

## 2. Fluxo da primeira visita

No componente `PropertyVisitButtons` (handler de "Realizar Visita"):

```text
clicar em Visitar
  └─ property.latitude && property.longitude?
       ├─ sim → segue visita normal
       └─ não → modal "Deseja usar sua localização atual
                       como localização oficial deste imóvel?"
                  ├─ SIM → navigator.geolocation.getCurrentPosition()
                  │         → grava lat/lng/geocoded_at/geocoded_by
                  │         → toast "Localização registrada"
                  │         → segue visita normal
                  └─ NÃO → segue visita normal (sem GPS)
```

Gravação offline-first: usa `useOfflineMutation`/repo de `properties` (Dexie + fila `mutations`).

## 3. Tela do imóvel (`_authenticated.property.$propertyId.tsx`)

Nova seção **Localização**:
- Lat / Lng (6 casas)
- "Georreferenciado em DD/MM/YYYY"
- Botão **📍 Ver no mapa** (abre Google Maps com `?q=lat,lng`)
- Botão **🔄 Atualizar localização** — visível apenas para `supervisor` / `admin_master` (usa `role-guards`)

Se sem coordenadas: aviso "Imóvel ainda não georreferenciado".

## 4. Mapa epidemiológico (`_authenticated.heatmap.tsx`)

Substitui agregação heurística por marcadores reais usando `latitude/longitude` de `properties`:
- 🟢 sem foco | 🔴 foco positivo | 🟠 pendente | 🔵 PE | 🟣 caso confirmado
- Clique → popup com histórico (visitas, depósitos, focos, pendências)
- Usa Google Maps JS API já presente (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`)

## 5. Exportação

Adicionar colunas `latitude` e `longitude` em `institutional-export.ts` (CSV/XLSX/PDF).

## 6. Permissões

- `agente` → pode gravar lat/lng **somente** quando ainda nulos (RLS já cobre por supervisor; adiciona policy específica)
- `supervisor` / `admin_master` → podem sobrescrever
- RLS via `has_role` + `can_supervise_user`

## 7. Offline

- Reuso do `db.properties` (Dexie) + `enqueueMutation({ table: 'properties', op: 'update', pk: id, payload: { latitude, longitude, geocoded_at } })`
- `syncEngine` já flusha quando online

## Arquivos a criar/editar

**Criar:**
- `supabase/migrations/<ts>_property_geo.sql` — colunas + índice + policy
- `src/components/property/GeolocationCaptureDialog.tsx` — modal SIM/NÃO + GPS
- `src/components/property/PropertyLocationSection.tsx` — bloco "Localização" na tela do imóvel
- `src/lib/geolocation.ts` — helper `requestCurrentPosition()` (Promise wrapper)

**Editar:**
- `src/components/PropertyVisitButtons.tsx` — intercepta clique de "Visitar" para abrir dialog quando faltam coords
- `src/routes/_authenticated.property.$propertyId.tsx` — inclui `PropertyLocationSection`
- `src/routes/_authenticated.heatmap.tsx` — passa a usar `properties.latitude/longitude`
- `src/lib/institutional-export.ts` — colunas lat/lng

## Decisões já tomadas (não vou perguntar)

- Sem rastreamento contínuo, sem histórico de trajeto, sem watchPosition.
- `getCurrentPosition` com `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }`.
- Imóvel sem coordenadas **não** bloqueia a visita.
- Reutiliza o mapa do Google já configurado; sem dependências novas.
