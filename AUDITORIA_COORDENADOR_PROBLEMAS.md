# 🔍 AUDITORIA: Sessão Coordenador - Status Atual

**Data:** 28/08/2026  
**Escopo:** Verificar se tudo está funcionando na sessão Coordenador  
**Resultado:** ⚠️ PROBLEMAS ENCONTRADOS

---

## 📊 CHECKLIST AUDITORIA

```
✅ ROTA EXISTE
├─ /coordenador (existe, redireciona para /coordenacao)
├─ /coordenacao (existe, carrega MunicipalIntelligence)
└─ Guards funcionando (bloqueia não-coordenadores)

⚠️ PERMISSÕES - PROBLEMAS ENCONTRADOS
├─ Coordenador vê TODOS os supervisores (INCORRETO!)
├─ Deveria ver apenas SEUS supervisores
├─ Deveria ver apenas agentes de SEUS supervisores
└─ ❌ NÃO HÁ FILTRO DE COORDINATOR_ID

✅ BANCO DE DADOS
├─ coordinator_id existe em profiles (✅)
└─ Campo está preparado para vincular coordenador

❌ COMPONENTE MunicipalIntelligence
├─ Não usa filtro por role
├─ Não filtra por coordinator_id
├─ Traz TODOS supervisores (segurança!)
└─ Traz TODOS agentes (segurança!)
```

---

## 🚨 PROBLEMA CRÍTICO ENCONTRADO

### Problema 1: Falta de Filtro no MunicipalIntelligence

**Arquivo:** `src/components/coordination/MunicipalIntelligence.tsx`

**Código Atual (ERRADO):**

```typescript
// Linha 41: Busca TODOS os perfis
const profiles = await supabase
  .from("profiles")
  .select("id, full_name, email, city, role, supervisor_id, coordinator_id, is_active");

// Linha 49-50: Filtra só por role, sem filtrar por coordinator_id!
const sups = (profs || [])
  .filter((p: any) => p.role === "supervisor");  // ← SEM FILTRO DE COORDINATOR_ID!
const ags = (profs || [])
  .filter((p: any) => p.role === "agente");      // ← SEM FILTRO DE SUPERVISORES!
```

**O que DEVERIA ser (CORRETO):**

```typescript
const profiles = await supabase
  .from("profiles")
  .select("id, full_name, email, city, role, supervisor_id, coordinator_id, is_active");

// Se é coordenador: filtrar seus supervisores
const sups = (profs || [])
  .filter((p: any) => {
    if (role === "admin_master") return p.role === "supervisor";  // Admin vê TODOS
    if (role === "coordenador") {
      // Coordenador vê apenas supervisores vinculados a ele
      return p.role === "supervisor" && p.coordinator_id === user?.id;
    }
    return false;
  });

// Para agentes: filtrar apenas agentes dos seus supervisores
const supIds = new Set(sups.map((s: any) => s.id));
const ags = (profs || [])
  .filter((p: any) => {
    if (role === "admin_master") return p.role === "agente";  // Admin vê TODOS
    if (role === "coordenador") {
      // Coordenador vê apenas agentes de seus supervisores
      return p.role === "agente" && supIds.has(p.supervisor_id);
    }
    return false;
  });
```

---

## 🔐 Impacto de Segurança

### Cenário Atual (Vulnerável)

```
COORDENADOR DA ZONA NORTE:
├─ Login: /coordenacao
├─ Vê no dashboard:
│  ├─ ✅ Seus supervisores (3)
│  ├─ ✅ Seus agentes (30)
│  ├─ ❌ Supervisores da Zona Sul (não deveria ver!)
│  ├─ ❌ Agentes da Zona Sul (não deveria ver!)
│  └─ ❌ Relatórios consolidados da Zona Sul (não deveria!)
│
└─ Dados expostos:
   ├─ Produção de outro coordenador
   ├─ Estratégia de trabalho de outro time
   ├─ Focos identificados em outro setor
   └─ Informações confidenciais!
```

### Risco

```
⚠️ ALTO RISCO - Data Leak

Coordenador 1 consegue ver:
├─ Dados de Coordenador 2
├─ Informações de equipes rival
├─ Estratégias de trabalho
└─ Relatórios confidenciais

Isso é uma VIOLAÇÃO DE ACESSO!
```

---

## ✅ O QUE ESTÁ CERTO

### 1. Rotas e Guards

```
✅ _authenticated.coordenador.tsx
├─ Guard bloqueia não-coordenadores
├─ Redireciona para /coordenacao
└─ Funciona corretamente

✅ _authenticated.coordenacao.tsx
├─ Guard bloqueia não-coordenadores
├─ Carrega componente correto
└─ Funciona corretamente
```

### 2. Schema do Banco

```
✅ Tabela profiles
├─ coordinator_id: uuid (FK para coordenador)
├─ supervisor_id: uuid (FK para supervisor)
└─ Estrutura certa para vincular
```

### 3. Funções Auxiliares

```
✅ scopedProfileIds em wave-c.functions.ts
├─ Filtra coordenadores corretamente
├─ Implementação está correta
├─ Usada em outras funções
└─ MAS NÃO USADA em MunicipalIntelligence!
```

---

## ❌ O QUE ESTÁ ERRADO

### 1. MunicipalIntelligence.tsx

**Problema:** Não filtra por coordinator_id

```
Linhas 41-50:
├─ Busca TODOS os perfis
├─ Não filtra coordenador
├─ Traz supervisores de TODOS coordenadores
└─ Traz agentes de TODOS supervisores

Risco:
├─ Violação de acesso
├─ Exposição de dados
└─ Confidencialidade comprometida
```

### 2. Falta de Validação

```
Não há validação se:
├─ Coordenador pertence aquele supervisor
├─ Supervisor pertence àquele coordenador
├─ Agente é da equipe do coordenador
└─ Tudo é possível de acessar!
```

---

## 🛠️ SOLUÇÃO RECOMENDADA

### Opção 1: Filtrar no Componente (Rápido)

```typescript
// src/components/coordination/MunicipalIntelligence.tsx

const sups = (profs || [])
  .filter((p: any) => {
    // Admin master vê tudo
    if (role === "admin_master") return p.role === "supervisor";
    // Coordenador vê apenas seus supervisores
    if (role === "coordenador") return p.role === "supervisor" && p.coordinator_id === user?.id;
    return false;
  });

const supIds = new Set(sups.map((s: any) => s.id));
const ags = (profs || [])
  .filter((p: any) => {
    if (role === "admin_master") return p.role === "agente";
    if (role === "coordenador") return p.role === "agente" && supIds.has(p.supervisor_id);
    return false;
  });
```

**Tempo:** 5 minutos  
**Risco:** Baixo (filtro simples)  
**Segurança:** ✅ Resolvido imediatamente

### Opção 2: Usar RLS (Seguro, Mas Complexo)

```sql
-- Policy no servidor: coordenador só vê seus supervisores
CREATE POLICY "Coordenador vê apenas seus supervisores"
ON profiles FOR SELECT
USING (
  auth.uid() = id OR  -- Vê a si mesmo
  (
    role = 'supervisor' AND 
    coordinator_id = auth.uid()  -- Coordenador vê seus supervisores
  ) OR
  (
    role = 'agente' AND
    supervisor_id IN (
      SELECT id FROM profiles 
      WHERE role = 'supervisor' 
      AND coordinator_id = auth.uid()
    )  -- Coordenador vê agentes de seus supervisores
  ) OR
  role = 'admin_master'  -- Admin vê tudo
);
```

**Tempo:** 30 minutos  
**Risco:** Médio (mudança no servidor)  
**Segurança:** ✅ Máxima segurança

### Opção 3: Ambos (Melhor)

```
1. Implementar Opção 1 (filtro no componente) → AGORA
2. Depois implementar Opção 2 (RLS) → Segurança extra
```

**Benefício:** Double-check de segurança  
**Recomendação:** ⭐⭐⭐ FAZER AMBOS

---

## 📋 Checklist de Correção

```
PARA CORRIGIR:

[ ] 1. Adicionar filtro de coordinator_id no MunicipalIntelligence
      └─ Linhas 49-50: adicionar condição p.coordinator_id === user?.id

[ ] 2. Adicionar filtro de supervisor_id para agentes
      └─ Filtrar agentes apenas de supervisores do coordenador

[ ] 3. Testar com 2 coordenadores
      └─ Coord 1 não vê dados de Coord 2

[ ] 4. Criar RLS policy (opcional, depois)
      └─ Segurança extra no servidor

[ ] 5. Teste de segurança
      └─ Verificar que coordenador não vê dados de outros

[ ] 6. Commit e deploy
      └─ Marcar como fix de segurança
```

---

## 🔍 Outras Funcionalidades do Coordenador

### CoordinatorDashboard

```
Arquivo: src/components/supervision/CoordinatorDashboard.tsx

Status: ✅ CORRETO
├─ Filtra supervisores por coordinator_id (linha 48)
├─ Filtra agentes por supervisores (linha 76)
└─ Implementação correta!

Código:
const supList = (profiles || [])
  .filter((p: any) => p.role === "supervisor");  // ← Sem filtro, PROBLEMA!
  // Deveria ser:
  .filter((p: any) => p.role === "supervisor" && p.coordinator_id === user?.id);
```

**ACHEI OUTRO PROBLEMA!** CoordinatorDashboard também não filtra!

### Outros Componentes

```
src/lib/wave-c.functions.ts
├─ Função scopedProfileIds: ✅ CORRETO
├─ Filtra coordenador: ✅ CORRETO
├─ Mas não usada em todos os lugares: ❌ PROBLEMA

Precisa revisar TODOS os componentes que usam coordenador
```

---

## 🚨 RESUMO DE PROBLEMAS

### Críticos (Segurança)

```
🔴 CRÍTICO 1: MunicipalIntelligence.tsx
   └─ Coordenador vê TODOS supervisores
   └─ Deveria ver apenas SEUS supervisores
   └─ Violação de segurança!

🔴 CRÍTICO 2: CoordinatorDashboard.tsx
   └─ Mesmo problema (não filtra por coordinator_id)
   └─ Violação de segurança!
```

### Altos (Funcionalidade)

```
🟠 ALTO 1: Falta usar scopedProfileIds
   └─ Função existe mas não é usada
   └─ Código duplicado/inconsistente

🟠 ALTO 2: RLS não está protegendo
   └─ Filtro deveria estar no servidor
   └─ Atualmente tudo no cliente
```

---

## 📊 Impacto por Severidade

| Problema | Severidade | Componente | Risco | Tempo Fixo |
|----------|-----------|-----------|-------|-----------|
| MunicipalIntelligence não filtra | 🔴 CRÍTICO | MunicipalIntelligence | Data leak | 5 min |
| CoordinatorDashboard não filtra | 🔴 CRÍTICO | CoordinatorDashboard | Data leak | 5 min |
| RLS não protege | 🟠 ALTO | Server-side | Circumvent | 30 min |
| scopedProfileIds não usado | 🟠 ALTO | Various | Code smell | 15 min |

---

## ✅ PLANO DE AÇÃO

### Imediato (AGORA)

```
1. Corrigir MunicipalIntelligence.tsx (5 min)
   └─ Adicionar filtro coordinator_id

2. Corrigir CoordinatorDashboard.tsx (5 min)
   └─ Adicionar filtro coordinator_id

3. Testar com múltiplos coordenadores (10 min)
   └─ Garantir isolamento de dados

4. Deploy (5 min)
   └─ Enviar para produção

TOTAL: 25 minutos
```

### Curto Prazo (Esta Semana)

```
1. Implementar RLS policies (30 min)
   └─ Segurança extra no servidor

2. Revisar TODOS componentes (1-2 horas)
   └─ Garantir filtros em todos

3. Audit de segurança (30 min)
   └─ Testar todas as rolas
```

---

## 🎯 CONCLUSÃO

```
╔════════════════════════════════════════════════════════════╗
║                    AUDITORIA FINAL                        ║
╚════════════════════════════════════════════════════════════╝

ESTRUTURA: ✅ Correta (rotas, guards, schema)

SEGURANÇA: 🔴 CRÍTICA (filtros faltando)

PROBLEMAS IDENTIFICADOS:
├─ MunicipalIntelligence não filtra (CRÍTICO)
├─ CoordinatorDashboard não filtra (CRÍTICO)
├─ RLS não está implementado (ALTO)
└─ scopedProfileIds não utilizado (MÉDIO)

RECOMENDAÇÃO:
✅ Implementar correções IMEDIATAMENTE
├─ Risco atual: Data leak entre coordenadores
├─ Tempo estimado: 25 minutos
└─ Prioridade: MÁXIMA

STATUS: 🔴 NÃO PRONTO PARA PRODUÇÃO (SEGURANÇA)
```

---

**Fim da Auditoria** 🔍
