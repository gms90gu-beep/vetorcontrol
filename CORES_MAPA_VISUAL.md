# 🗺️ Sistema de Cores do Mapa VetorControl

**Data de atualização:** 27/08/2026  
**Status:** ✅ Implementado e Testado

---

## 📊 Paleta de Cores Padrão

```
┌────────────────────────────────────────────────────────────┐
│ PRIORIDADE MÁXIMA                                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🔴 FOCO POSITIVO                                        │
│     Cor: #dc2626 (vermelho vibrante)                     │
│     Significado: Foco de dengue/mosquito encontrado      │
│     Ação: INVESTIGAR IMEDIATAMENTE                       │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ PRIORIDADE ALTA                                           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🟠 FECHADA / RECUSADA                                   │
│     Cor: #f97316 (laranja vibrante)                      │
│     Significado:                                          │
│       • Fechada: Imóvel não foi visitado (porta fechada) │
│       • Recusada: Dono recusou vistoria                  │
│     Ação: RETOMAR OU REGISTRAR PENDÊNCIA                │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ PRIORIDADE MÉDIA                                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🟡 PENDÊNCIA                                            │
│     Cor: #f97316 (laranja) *                             │
│     Significado: Visita incompleta ou falta informação   │
│     Ação: COMPLETAR DADOS                                │
│                                                            │
│  * Mesma cor de Fechada por serem ambas "aguardando"    │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ PRIORIDADE BAIXA                                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🟢 VISITADO (SEM FOCO)                                  │
│     Cor: #10b981 (verde)                                 │
│     Significado: Visita realizada, sem foco encontrado   │
│     Status: ✅ COMPLETO                                  │
│                                                            │
│  🔵 PONTO ESTRATÉGICO                                    │
│     Cor: #3b82f6 (azul)                                  │
│     Significado: Área de risco estratégico (poço, bueiro)│
│     Ação: MONITORAR REGULARMENTE                         │
│                                                            │
│  ⚪ NÃO INICIADO                                         │
│     Cor: #94a3b8 (cinza)                                 │
│     Significado: Nenhuma visita ainda                    │
│     Ação: AGENDAR VISTORIA                               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 🎯 Como Interpretar no Mapa

### Zoom Out (Visão Geral)
```
Você vê pontos coloridos no mapa:

🔴 Vermelho = "PERIGO! Foco encontrado aqui"
🟠 Laranja = "Atenção: Fechada ou Recusada"
🟢 Verde = "OK: Sem problemas"
🔵 Azul = "Monitore: Ponto estratégico"
```

### Zoom In (Detalhe do Bloco)
```
Ao entrar em um quarteirão, você pode:
1. Ver todos os marcadores com cores
2. Clicar em um marcador para detalhes
3. Usar filtros para ver apenas:
   ├─ Focos
   ├─ Recusadas
   ├─ Fechadas
   ├─ Visitadas
   ├─ Pendentes
   ├─ Estratégicos
   ├─ Terrenos baldios
   └─ Sem GPS
```

---

## 🧩 Implementação Técnica

### Arquivo Central: `src/components/map/shared/providers.ts`

```typescript
export const MARKER_COLORS = {
  focus: "#dc2626",      // 🔴 Foco (vermelho vibrante)
  pendency: "#f97316",   // 🟡 Pendência (laranja)
  closed: "#f97316",     // 🟠 Fechada (laranja)
  refused: "#f97316",    // 🟠 Recusada (laranja)
  strategic: "#3b82f6",  // 🔵 Estratégico (azul)
  clean: "#10b981",      // 🟢 Visitado (verde)
  case: "#a855f7",       // 🟣 Caso (roxo)
  unknown: "#94a3b8",    // ⚪ Não iniciado (cinza)
  valid: "#16a34a",      // Georreferenciamento: válido
  missing: "#eab308",    // Georreferenciamento: falta coord
  invalid: "#dc2626",    // Georreferenciamento: inválido
  duplicated: "#9333ea", // Georreferenciamento: duplicado
};
```

### Componentes Afetados

| Componente | Arquivo | Função |
|-----------|---------|--------|
| Mapa do Bloco | `BlockOperationalMap.tsx` | Exibe visitas com cores |
| Dashboard | `AgentDashboard.tsx` | Histórico colorido |
| Legenda | `SharedLegend.tsx` | Explica as cores |
| Auditoria | `GeorefAuditMap.tsx` | Validação de coordenadas |
| Visão Operacional | `OperationalMapView.tsx` | Mapa estratégico |

---

## 🎓 Exemplos Práticos

### Cenário 1: Agente Nova Usuária Aprendendo

```
Primeira visita ao bloco:
└─ Abre mapa do quarteirão
   └─ Vê muitos ⚪ cinzas (não visitados)
   └─ Começa a visitar...
   
Após visitar 3 imóveis:
├─ 1ª: Encontrou foco → 🔴 vermelho (alerta!)
├─ 2ª: Porta fechada → 🟠 laranja (retomar)
└─ 3ª: Sem foco → 🟢 verde (OK)

Resultado: Mapa agora mostra progresso com cores!
```

### Cenário 2: Supervisor Revisando Turno

```
Coordenador abre mapa:

1. Filtro "Focos" ativa
   └─ Vê APENAS 🔴 pontos vermelhos
   └─ Sabe exatamente onde investigar

2. Filtro "Recusadas" ativa
   └─ Vê APENAS 🟠 pontos laranja
   └─ Sabe quais casas retomar

3. Filtro "Visitadas" ativa
   └─ Vê APENAS 🟢 pontos verdes
   └─ Confirma trabalho concluído
```

### Cenário 3: Retomada de Jornada Noturna

```
Agente trabalhou durante dia:
├─ Visitou 15 imóveis
├─ Encontrou 2 focos
└─ 1 casa fechada

À noite abre mapa:
├─ 🔴 2 pontos vermelhos destacam focos
├─ 🟠 1 ponto laranja mostra casa fechada
├─ 🟢 12 pontos verdes mostram trabalho realizado
└─ Sistema sugere: "Retomar fechada?" ou "Investigar focos?"
```

---

## 📱 Visual no App

### Mobile (Tela Pequena)
```
┌─────────────────────────┐
│ [Mapa com marcadores]   │
│ 🔴 🔴 🟠          ← Focos e recusadas destacam
│    🟢   🟢  🟡    ← Resto dos pontos
└─────────────────────────┘
│ Legenda:                │
│ 🔴 Foco                 │
│ 🟠 Fechada/Recusada    │
│ 🟡 Pendência            │
│ 🟢 Visitado             │
└─────────────────────────┘
```

### Desktop (Tela Grande)
```
┌─────────────────────────────────────────────┐
│ Mapa do Quarteirão 15                       │
├─────────────────────────────────────────────┤
│                                             │
│  [Mapa com cluster de marcadores]          │
│                                             │
│  Filtros: [Todos] [Focos] [Recusadas]     │
│           [Visitados] [Pendentes] [+]     │
│                                             │
│  Legenda:                                  │
│  🔴 Foco (3)        🟢 Visitado (12)      │
│  🟠 Fechada (2)     🔵 Estratégico (1)    │
│  🟡 Pendência (5)   ⚪ Não iniciado (8)   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🔄 Evolução Histórica

```
Antes (❌ Confuso):
├─ Visitado: 🟢 verde
├─ Fechado: 🟢 verde (igual!)
├─ Recusado: 🟢 verde (igual!)
└─ Usuários confundiam: "Qual é qual?"

Depois (✅ Claro):
├─ Foco: 🔴 vermelho VIBRANTE (destaque máximo)
├─ Fechada: 🟠 laranja (atenção)
├─ Recusada: 🟠 laranja (atenção)
├─ Visitada: 🟢 verde (ok)
└─ Usuários veem diferença IMEDIATAMENTE
```

---

## 🎨 Justificativa das Cores

| Cor | Razão | Psicologia |
|-----|-------|-----------|
| 🔴 Vermelho | Foco = Perigo de dengue | Alertar = Ação imediata |
| 🟠 Laranja | Fechada = Precisa retornar | Atenção = Próxima ação |
| 🟡 Amarelo | Pendência = Incompleto | Cuidado = Revisar |
| 🟢 Verde | Visitado = Seguro | Sucesso = Trabalho feito |
| 🔵 Azul | Estratégico = Informativo | Informação = Monitorar |

---

## ✅ Testes Implementados

```bash
# Ver cores em diferentes contextos:
1. npm run dev
2. Ir para "Trabalho de Campo"
3. Abrir um quarteirão
4. Ver mapa colorido
5. Usar filtros: "Focos", "Recusadas", etc.

# Testar modo retroativo:
1. Alterar data para ontem
2. Encontrar um foco
3. Ver cor 🔴 no mapa
4. Filtro "Focos" mostra apenas esse ponto
```

---

## 📝 Changelog

```
v1.0 (27/08/2026)
├─ 🎨 Adicionar cores distintas para Foco vs Fechada
├─ 🟠 Foco: #dc2626 (vermelho vibrante)
├─ 🟠 Fechada/Recusada: #f97316 (laranja)
├─ 🔄 Reordenar legenda por prioridade
├─ 🧩 Padronizar em BlockOperationalMap
├─ 🧩 Padronizar em AgentDashboard
├─ 🧩 Padronizar em SharedLegend
└─ ✅ Implementado e testado
```

---

**Conclusão:** ✅ **Agora você consegue distinguir FOCOS (vermelho) de FECHADAS (laranja) no mapa!**

🗺️ Mapa mais legível  
🎯 Prioridades claras  
⚡ Ação mais rápida  

