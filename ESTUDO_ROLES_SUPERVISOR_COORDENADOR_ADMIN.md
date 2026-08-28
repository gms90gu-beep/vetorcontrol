# 📊 ESTUDO COMPLETO: Supervisor vs Coordenador vs Admin Master

**Data:** 28/08/2026  
**Objetivo:** Análise de funções, redundância e recomendação  
**Versão:** 1.0

---

## 🎯 RESUMO EXECUTIVO

```
┌────────────────────────────────────────────────────┐
│ PERGUNTA: Vale a pena ter COORDENADOR?             │
│                                                    │
│ RESPOSTA: SIM! Mas com ressalva importante.       │
│                                                    │
│ Coordenador ≠ Admin Master                        │
│ Coordenador vê múltiplos supervisores + agentes   │
│ Admin Master vê TUDO (sistema todo)               │
└────────────────────────────────────────────────────┘
```

---

## 🏢 HIERARQUIA DO SISTEMA

```
┌────────────────────────────────────────────────────┐
│              ADMIN MASTER                          │
│              (Superuser)                           │
│  • Vê tudo (municipio inteiro)                    │
│  • Pode criar/deletar qualquer coisa               │
│  • Acesso a ferramentas admin                      │
└────────────────────────────────────────────────────┘
                         ▲
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼─────────┐           ┌──────────▼──────────┐
│   COORDENADOR   │           │  SUPERVISOR         │
│ (Gerente)       │           │  (Chefe de Equipe)  │
│ • Vê múltiplos  │           │ • Vê sua equipe     │
│   supervisores  │           │   (1 supervisor)    │
│ • Vê agentes    │           │ • Vê seus agentes   │
│   desses sup.   │           │ • Controla trabalho │
│ • Gerencia      │           │ • Monitora produção │
│   múltiplos     │           │                     │
│   times         │           │                     │
└────────────────┘           └─────────────────────┘
        │                           │
        └──────────────┬────────────┘
                       ▼
        ┌──────────────────────────┐
        │  AGENTE (Operacional)    │
        │ • Trabalha no campo      │
        │ • Faz visitas            │
        │ • Preenche dados         │
        │ • Não vê outros agentes  │
        └──────────────────────────┘
```

---

## 📋 FUNÇÕES DETALHADAS

### 1️⃣ AGENTE

#### Acesso

```
Escopo: APENAS SUAS PRÓPRIAS AÇÕES

Pode ver:
✅ Seu próprio dashboard
✅ Seus ciclos/jornadas
✅ Suas visitas
✅ Seus blocos em trabalho
✅ Seu histórico de produção

Não pode ver:
❌ Dados de outros agentes
❌ Dados de outros supervisores
❌ Ferramentas administrativas
❌ Relatórios de município
❌ RG reconciliation
```

#### Telas Disponíveis

```
✅ /dashboard (seu dashboard pessoal)
✅ /field-work (painel operacional)
✅ /rg (seus RGs)
✅ /agente (painel agente)
❌ /supervision (bloqueado - redirecciona)
❌ /admin-master (bloqueado)
❌ /relatorios (bloqueado)
```

#### Dados Que Acessa

```
Database:
- profiles (apenas seu perfil)
- field_work_sessions (suas sessões)
- visits (suas visitas)
- blocks (blocos que trabalha)
- properties (propriedades de seus blocos)
- boletins_rg (seus RGs)
```

---

### 2️⃣ SUPERVISOR

#### Acesso

```
Escopo: SUAS EQUIPES (múltiplos agentes)

Pode ver:
✅ Sua equipe (todos seus agentes)
✅ Dashboard executivo (sua equipe)
✅ Relatórios (sua equipe)
✅ Pendências (sua equipe)
✅ Produção (sua equipe)
✅ Geo-referenciamento (sua equipe)
✅ RG reconciliation (sua equipe)

Não pode ver:
❌ Equipes de outros supervisores
❌ Dados de todo o município
❌ Ferramentas de admin master
❌ Sistema health / RBAC audit
```

#### Como Funciona

```
O supervisor é vinculado a múltiplos agentes
via campo profiles.supervisor_id

Quando supervisor acessa:
├─ Dashboard → vê apenas agentes onde supervisor_id = seu ID
├─ Relatórios → filtra por seus agentes
├─ Pendências → mostra problemas de sua equipe
└─ Produção → calcula totais de sua equipe
```

#### Telas Disponíveis

```
✅ /dashboard (seu dashboard - sua equipe)
✅ /supervisor (painel supervisor)
✅ /supervision (painel de supervisão)
✅ /map (mapa dos seus agentes)
✅ /relatorios (relatórios de sua equipe)
✅ /coordenacao (se coordenador = sim, restrições)
❌ /admin-master (bloqueado)
```

#### Permissões

```
Ações que pode fazer:
✅ Visualizar dados de seus agentes
✅ Gerar relatórios de sua equipe
✅ Ver pendências de sua equipe
✅ Monitorar produção
✅ Acessar mapa operacional de sua equipe
✅ Ver dashboards executivos

Ações que NÃO pode fazer:
❌ Criar/deletar usuários
❌ Modificar roles
❌ Acessar RG reconciliation
❌ Ver dados de outros supervisores
❌ Acessar ferramentas de admin
```

---

### 3️⃣ COORDENADOR

#### O QUE É?

```
Coordenador = SUPERVISOR DE SUPERVISORES

Função: Gerenciar múltiplos supervisores e suas equipes
Hierarquia: entre Supervisor e Admin Master
```

#### Acesso

```
Escopo: MÚLTIPLOS SUPERVISORES + SEUS AGENTES

Pode ver:
✅ Seus supervisores (vinculados via coordinator_id)
✅ Todos os agentes desses supervisores
✅ Dashboard consolidado (todos seus times)
✅ Relatórios (todos seus times)
✅ Pendências (todos seus times)
✅ Produção agregada (todos seus times)
✅ Geo-referenciamento (todos seus times)

Não pode ver:
❌ Supervisores de outros coordenadores
❌ Agentes de outros times
❌ Ferramentas de admin master
❌ Sistema health / RBAC audit
```

#### Como Funciona (IMPORTANTE!)

```
Coordenador está vinculado a múltiplos SUPERVISORES
via campo profiles.coordinator_id

Quando coordenador acessa dados:
├─ Procura: SELECT * FROM profiles WHERE coordinator_id = seu ID
│  └─ Retorna: Lista de supervisores que você gerencia
│
├─ Para cada supervisor, procura seus agentes:
│  └─ SELECT * FROM profiles 
│     WHERE supervisor_id IN (seus supervisores)
│     └─ Retorna: Todos agentes de todos seus times
│
└─ Dashboard mostra: CONSOLIDADO de todos seus times
   ├─ Produção total de todos times
   ├─ Pendências de todos times
   ├─ Relatórios de todos times
   └─ Sem acesso a dados de admin
```

#### Telas Disponíveis

```
✅ /dashboard (seu dashboard - consolidado)
✅ /coordenador (painel coordenador - novo)
✅ /coordenacao (painel de coordenação)
✅ /supervision (supervisão de seus times)
✅ /map (mapa de todos seus agentes)
✅ /relatorios (relatórios de todos seus times)
❌ /admin-master (bloqueado)
```

#### Permissões

```
Ações que pode fazer:
✅ Visualizar dados de todos seus supervisores
✅ Visualizar dados de todos agentes de seus supervisores
✅ Gerar relatórios consolidados
✅ Ver pendências de todos seus times
✅ Monitorar produção agregada
✅ Acessar mapa operacional consolidado
✅ Dashboard executivo (múltiplos times)

Ações que NÃO pode fazer:
❌ Criar/deletar usuários (mesmo seus supervisores)
❌ Modificar roles
❌ Acessar RG reconciliation avançado
❌ Ver dados de coordenadores/supervisores de outros times
❌ Acessar ferramentas de admin master
❌ Ver system health / RBAC audit
```

---

### 4️⃣ ADMIN MASTER

#### O QUE É?

```
Admin Master = SUPERUSER DO SISTEMA

Função: Gerenciar TUDO - usuários, roles, dados, sistema
Hierarquia: Acima de coordenadores
```

#### Acesso

```
Escopo: TUDO (MUNICÍPIO TODO)

Pode ver:
✅ TODOS os usuários
✅ TODOS os supervisores
✅ TODOS os coordenadores
✅ TODOS os agentes
✅ TODOS os dados
✅ Todas as ferramentas administrativas
✅ System health
✅ RBAC audit
✅ RG reconciliation
✅ Data audit
✅ Relatórios globais

Retorno no sistema:
❌ Nada (acesso total)
```

#### Telas Disponíveis

```
✅ /dashboard (seu dashboard - global)
✅ /admin-master (painel admin master - novo)
✅ /supervision (supervisão global)
✅ /map (mapa de TODOS agentes)
✅ /relatorios (relatórios globais)
✅ /admin/rg-reconcile (RG reconciliation)
✅ /admin/rbac-audit (auditoria RBAC)
✅ /admin/system-health (saúde do sistema)
✅ /admin/data-audit (auditoria de dados)
✅ /coordenacao (visão global)
```

#### Permissões

```
Ações que pode fazer:
✅ Criar/deletar qualquer usuário
✅ Modificar roles de qualquer um
✅ Acessar RG reconciliation avançado
✅ Ver dados de qualquer pessoa/departamento
✅ Acessar ferramentas administrativas
✅ Ver system health e logs
✅ Fazer RBAC audit
✅ Fazer data audit
✅ Gerar relatórios globais
✅ Configurar sistema

Ações que pode fazer:
✅ TUDO (é superuser)
```

---

## 🔍 COMPARAÇÃO: TABELA COMPLETA

| Aspecto | Agente | Supervisor | Coordenador | Admin Master |
|---------|--------|-----------|------------|------------|
| **Vê dados de** | Apenas si | Sua equipe | Múltiplos times | Tudo |
| **Número de agentes** | 1 (si mesmo) | ~5-20 | ~20-100+ | Ilimitado |
| **Pode ver dashboard de** | Pessoal | Sua equipe | Seus times | Tudo |
| **Relatórios** | Pessoal | Sua equipe | Seus times | Global |
| **Pode criar usuários** | ❌ | ❌ | ❌ | ✅ |
| **Pode modificar roles** | ❌ | ❌ | ❌ | ✅ |
| **Acesso a RG reconcile** | ❌ | ✅ (equipe) | ✅ (times) | ✅ (global) |
| **System health** | ❌ | ❌ | ❌ | ✅ |
| **RBAC audit** | ❌ | ❌ | ❌ | ✅ |
| **Data audit** | ❌ | ❌ | ❌ | ✅ |
| **Acesso /admin-master** | ❌ | ❌ | ❌ | ✅ |
| **Supervisores acima** | 1 | 0 | 0-N | 0 |
| **Coordenadores acima** | 0 | 1 ou 0 | 0 | 0 |
| **Admin acima** | Sim (supervisor) | Sim (coordenador ou admin) | Sim (admin) | Nenhum |

---

## 🎯 CASOS DE USO

### Estrutura 1: Pequeno Município (~50 agentes)

```
Admin Master
    │
    └─ 5 Supervisores (10 agentes cada)

Configuração:
├─ 1 Admin Master (gerencia tudo)
├─ 5 Supervisores (cada um tem 10 agentes)
└─ SEM Coordenador (desnecessário com poucos times)

Quando usar:
- Município pequeno
- Poucos supervisores
- Fácil gerenciar todos
```

### Estrutura 2: Médio Município (~200 agentes)

```
Admin Master
    │
    ├─ 1 Coordenador
    │   ├─ 3 Supervisores (cada um com 20 agentes)
    │   └─ 1 Supervisor (15 agentes)
    │
    └─ 2 Supervisores (25 agentes cada)

Configuração:
├─ 1 Admin Master
├─ 1 Coordenador (gerencia 4 supervisores = 75 agentes)
├─ 6 Supervisores (distribuídos)
└─ 200 Agentes

Quando usar:
- Município de médio porte
- Múltiplos times precisam coordenação
- Supervisor de supervisor faz sentido
```

### Estrutura 3: Grande Município (~500+ agentes)

```
Admin Master
    │
    ├─ Coordenador 1 (2-3 supervisores cada)
    ├─ Coordenador 2 (2-3 supervisores cada)
    ├─ Coordenador 3 (2-3 supervisores cada)
    └─ Coordenador N (mais times)

Configuração:
├─ 1 Admin Master
├─ 3-5 Coordenadores (cada um gerencia 2-3 supervisores)
├─ 8-12 Supervisores (distribuídos entre coordenadores)
└─ 500+ Agentes

Quando usar:
- Grande município
- Múltiplos coordenadores diferentes
- Necessário 2 níveis de gerência
```

---

## ❓ VALE A PENA TER COORDENADOR?

### RESPOSTA: SIM, MAS NEM SEMPRE

#### QUANDO VALE A PENA

```
✅ USAR COORDENADOR QUANDO:

1. Município é médio/grande (100+ agentes)
   └─ Muitos supervisores para um admin gerenciar

2. Têm geograficamente dispersos
   └─ Ex: diferentes bairros/distritos
   └─ Cada coordenador fica responsável por uma área

3. Estrutura de negócio tem "níveis intermediários"
   └─ Ex: Gerente Regional → Chefes de Zona → Agentes

4. Supervisores precisam de gestor comum
   └─ Políticas consolidadas
   └─ Relatórios por equipe

5. Muita carga no Admin Master
   └─ Admin Master sobrecarregado
   └─ Delegar para coordenadores
```

#### QUANDO NÃO VALE A PENA

```
❌ NÃO USAR COORDENADOR QUANDO:

1. Município pequeno (< 100 agentes)
   └─ Admin Master consegue gerenciar tudo

2. Poucos supervisores (< 3)
   └─ Sem sentido ter nível intermediário

3. Admin Master gosta de controle total
   └─ Prefere ver tudo direto
   └─ Não quer intermediários

4. Estrutura organizacional é simples
   └─ Admin → Supervisores → Agentes (3 níveis)
   └─ Sem necessidade de 4 níveis
```

---

## ⚠️ REDUNDÂNCIA: Coordenador vs Admin Master

### SÃO IGUAIS?

```
❌ NÃO! São diferentes!

COORDENADOR:
├─ Vê múltiplos supervisores
├─ Vê agentes desses supervisores
├─ Relatórios consolidados de seus times
└─ NÃO tem acesso a ferramentas admin

ADMIN MASTER:
├─ Vê TODO O SISTEMA
├─ Pode criar/deletar usuários
├─ Acesso a RG reconciliation avançado
├─ System health / RBAC audit
└─ HAS ACESSO A TUDO
```

### Diferença Chave

```
COORDENADOR:
- "Gerenciador de Equipes"
- Usa dados OPERACIONAIS
- Monitora produção de seus times
- Não pode mexer em admin

ADMIN MASTER:
- "Administrador do Sistema"
- Usa ferramentas ADMINISTRATIVAS
- Cuida da saúde do sistema
- Pode mudar qualquer coisa
```

---

## 🎓 RECOMENDAÇÃO FINAL

### Para Este Município

```
┌──────────────────────────────────────────────────┐
│ RECOMENDAÇÃO: MANTER COORDENADOR!                │
└──────────────────────────────────────────────────┘

Razões:
✅ Seu município parece ter 100+ agentes
✅ Múltiplos supervisores
✅ Vale a pena ter nível intermediário
✅ Coordenador ≠ Admin Master (não é redundante)
✅ Melhora organização

Configuração Proposta:
├─ 1 Admin Master (seu admin)
├─ 1-2 Coordenadores (por área geográfica ou departamento)
├─ 3-6 Supervisores (sob cada coordenador)
└─ ~100+ Agentes (sob supervisores)
```

### Implementação

```
DEIXAR COMO ESTÁ:
✅ Role "coordenador" deve ficar
✅ Já está implementado
✅ Já tem telas dedicadas
✅ Já tem permissões específicas

MELHORAR:
📝 Documentar bem para usuários
   └─ Explicar diferença coordenador vs admin
   
📝 Criar guia de quando usar cada um
   └─ Como estruturar hierarquia
   
📝 Dashboard do coordenador mais intuitivo
   └─ Já existe, mas pode melhorar
```

---

## 📊 RESUMO FUNCIONALIDADES

```
AGENTE:
└─ Ver: Seus dados pessoais
   Ações: Trabalhar no campo, fazer visitas

SUPERVISOR:
└─ Ver: Sua equipe (múltiplos agentes)
   Ações: Monitorar, gerar relatórios de sua equipe

COORDENADOR:
└─ Ver: Seus supervisores + agentes deles
   Ações: Monitorar múltiplos times, consolidar relatórios

ADMIN MASTER:
└─ Ver: TUDO
   Ações: Administrar sistema, criar usuários, ferramentas admin
```

---

## ✅ CONCLUSÃO

```
┌──────────────────────────────────────────────────┐
│ VALE A PENA TER COORDENADOR? SIM!               │
│                                                 │
│ É Redundante com Admin Master? NÃO!             │
│                                                 │
│ Diferença Chave:                               │
│ - Coordenador: Gerencia EQUIPES                │
│ - Admin Master: Gerencia SISTEMA               │
│                                                 │
│ Manter implementado e documentado bem! ✅      │
└──────────────────────────────────────────────────┘
```

---

**Fim da Análise** 📊
