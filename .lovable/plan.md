# Fase 2 — Inteligência Operacional (plano)

Escopo grande. Proponho quebrar em **5 entregas incrementais**, cada uma estável antes da próxima. Todas usam tabelas existentes (`field_work_sessions`, `properties`, `visits`, `boletins_rg`, `daily_work_records`, `blocks`), relacionamento por `block_id`, e **zero mudança** em Sync Engine / SafeFetch / Repos / Dexie / RLS.

Sem registro de horário por visita, sem tempo por imóvel — confirmado.

## Entrega 2.A — Mapa Operacional do Quarteirão
- Novo componente `BlockOperationalMap.tsx` em `src/components/field-work/`, usando `@/components/map/shared` (`SharedMap` + `SharedMarkerLayer`).
- Fonte: `properties` do `block_id` da jornada em `in_progress`, cruzando com `visits` (visitado / foco / pendente) e `type` (PE / terreno).
- Cores: verde=visitado, vermelho=foco, laranja=pendente, azul=PE, cinza=não iniciado.
- Popup: número, complemento, tipo, situação, foco, pendência, coords, botão "Abrir Visita" (navega para `/property/$id`), botão "🧭 Navegar" (abre `https://www.google.com/maps/dir/?api=1&destination=lat,lng`).
- Filtros: Todos, Visitados, Pendentes, Focos, PE, Terrenos, Sem GPS.
- Heatmap opcional (toggle) via `leaflet.heat` já disponível no projeto de mapas.
- Integração: novo botão "Mapa" na barra fixa do `OperationalPanel` abre em `Dialog` fullscreen.

## Entrega 2.B — Assistente Operacional (regras, sem IA)
- Componente `SmartAssistantCard.tsx` no topo colapsável do painel.
- Regras derivadas dos dados já carregados: pendentes, sem GPS, focos sem visita fechada, depósitos sem foco vinculado, % concluído.
- Mensagens estáticas em pt-BR + botão de ação ("Ir para o primeiro pendente", "Georreferenciar", etc.).

## Entrega 2.C — Histórico Territorial do Imóvel
- Nova aba/seção "Histórico" em `_authenticated.property.$propertyId.tsx`.
- Query: todas as `visits` do `property_id` ordenadas por ciclo/semana, com agente, foco, coords, fotos (se houver).
- Timeline vertical simples (ciclo → resultado).

## Entrega 2.D — Checklist Inteligente de Encerramento
- Estender `src/lib/shift-validation.ts` + `DailyWorkCloser.tsx`.
- Verificações extras: GPS ausente, focos/depósitos/larvicida vinculados, DWR gerado.
- Modal com lista de inconsistências e botões: Corrigir (deep-link), Sincronizar, Finalizar mesmo assim (apenas supervisor/admin).

## Entrega 2.E — UX Avançada
- Swipe esquerda/direita para navegar entre imóveis na tela de visita.
- Botões rápidos "Ir para primeiro pendente/foco/PE/sem GPS" no assistente.
- Long-press na lista → menu com Abrir/Georref/Editar/Histórico/Mapa.
- Fotos rápidas (imóvel/foco/depósito) reutilizando componentes existentes.

## Ordem sugerida
1. **2.A Mapa** (maior valor visível, isolado)
2. **2.B Assistente** (baixo risco, curto)
3. **2.E UX** (polimento em cima do painel)
4. **2.C Histórico** (mudança na tela de imóvel)
5. **2.D Checklist** (mais crítico, por último para estabilizar)

## Detalhes técnicos
- Mapa: `SharedMap` já resolve tiles, cluster, fallback. `MARKER_COLORS` já cobre a paleta.
- Google Maps navigation: link externo puro (`window.open`), sem API key.
- Long-press: hook `usePointerLongPress` simples (sem lib).
- Swipe: `@use-gesture/react` (já no bundle? — verificar; senão, handler pointer nativo).
- Nada de novas tabelas, nenhuma migração, nenhum edge function.

## Pergunta
Confirma esta divisão em 5 entregas nessa ordem, ou prefere entregar tudo de uma vez / mudar a ordem?
