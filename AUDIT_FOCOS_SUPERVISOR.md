# 🔍 AUDITORIA: Focos não computam para Supervisor/Coordenador/Admin Master

**Data:** 27/08/2026  
**Problema:** Supervisor, Coordenador e Admin Master não estão vendo/computando focos encontrados pelos agentes  
**Status:** 🔴 Problema Confirmado - Auditoria Completa

---

## 📋 SUMÁRIO EXECUTIVO

```
❌ PROBLEMA CONFIRMADO:
├─ Agente encontra foco → Salva com has_focus = TRUE
├─ Supervisor abre Dashboard → has_focus = NULL ou invisível
├─ Coordenador abre Dashboard → has_focus = NULL ou invisível
├─ Admin Master abre Dashboard → has_focus = NULL ou invisível

POSSÍVEIS CAUSAS (ordem de probabilidade):
1. 🔴 ALTÍSSIMA: Coluna has_focus é salva como FALSE mesmo quando marcado TRUE
2. 🟠 ALTA: RLS Policy bloqueia acesso à coluna para não-agentes
3. 🟡 MÉDIA: Campo não está sendo populado no banco durante INSERT
4. 🟡 MÉDIA: Há filtro invisível filtrando focos por user_id
```

---

## 🔬 ANÁLISE TÉCNICA

### 1. Como Focos São Salvos (Property View)

**Arquivo:** `src/routes/_authenticated.property.$propertyId.tsx`, linha 681

```typescript
// Quando usuário clicar "Salvar" após marcar "Foco Encontrado":

const visitPayload = {
  id: uuidv4(),
  agent_id: user.id,
  property_id: propertyId,
  cycle_id: session.cycle_id,
  status: "visited",           // Status sempre "visited" quando survey
  activity_type: "survey",     // Atividade é "survey"
  has_focus: (status === 'visited' && activity === 'survey') 
             ? surveyData.hasFocus 
             : false,           // 👈 AQUI! SÓ RECEBE surveyData.hasFocus
  // ... outros campos
};

// 🚨 PROBLEMA: surveyData.hasFocus vem de onde?
//    └─ Linha 1318: <checkbox value={surveyData.hasFocus} />
```

**Questão 1:** O valor de `surveyData.hasFocus` está sendo atualizado corretamente quando agente clica no checkbox?

---

### 2. Como Supervisor Vê Focos (OperationalDashboard)

**Arquivo:** `src/components/supervision/OperationalDashboard.tsx`, linha 60

```typescript
// Supervisor carrega TODAS as visitas:
const vs = supabase
  .from("visits")
  .select("id, agent_id, status, has_focus, visit_date, cycle_id, week_id, property_id")
  // 🔴 NÃO HÁ FILTRO POR user_id!
  // 🔴 NÃO HÁ FILTRO POR status ou has_focus
  // 👉 Deveria trazer TUDO com has_focus

// Depois calcula:
focos: av.filter((v) => v.has_focus).length
// 👉 Conta quantos têm has_focus = TRUE
```

**Questão 2:** A coluna `has_focus` está vindo como TRUE do banco, ou vem como NULL/FALSE?

---

### 3. Como Coordenador Vê Focos (CoordinatorDashboard)

**Arquivo:** `src/components/supervision/CoordinatorDashboard.tsx`, linha 63

```typescript
// Coordenador carrega TODAS as visitas:
const visits = supabase
  .from("visits")
  .select("agent_id, status, has_focus")
  // 🔴 NÃO HÁ FILTRO!

// Depois calcula:
focusCount: teamVisits.filter((v: any) => v.has_focus).length
```

**Questão 3:** Mesma questão anterior - está vindo como TRUE?

---

## 🎯 HIPÓTESES DE CAUSA

### Hipótese 1: has_focus salva como FALSE (ALTÍSSIMA PROBABILIDADE)

```
Cenário:
1. Agente abre property
2. Clica em "Trabalho de Campo" → Tipo "survey"
3. Marca checkbox "Foco Encontrado" ✓
4. Clica "Salvar"
5. Sistema envia:
   {
     status: "visited",
     activity_type: "survey",
     has_focus: false  ← 🚨 POR QUE FALSE?
   }

Razão possível:
- surveyData.hasFocus não está sendo atualizado
- Ou o setState não está funcionando
- Ou o form é resetado antes de salvar
```

**Teste:** Verificar console do browser se o valor é correto antes de enviar

---

### Hipótese 2: RLS Policy Bloqueia Leitura (ALTA PROBABILIDADE)

```
Cenário (Supabase side):
- Tabela: visits
- RLS Policy: "SELECT only own visits"
  └─ created_by = auth.uid() OR user.role != 'agente'?

Se policy for:
  created_by = auth.uid()
  
Então supervisor não consegue ver:
  ├─ visits de outros agentes
  └─ especialmente has_focus deles
```

**Teste:** Abrir DevTools → Network → Ver se SELECT de visits retorna `has_focus: null`

---

### Hipótese 3: Campo não está na tabela (MÉDIA PROBABILIDADE)

```
Se schema de visits é:
  id, agent_id, property_id, status, activity_type, ...
  ❌ SEM has_focus

Então:
- Campo pode estar em outra tabela (visit_deposits?)
- Ou foi removido acidentalmente
```

**Teste:** No Supabase console, ir em SQL e executar:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'visits' AND column_name LIKE '%focus%';
```

---

### Hipótese 4: Filtro Invisível por user_id (BAIXA PROBABILIDADE)

```
Se há lógica no backend tipo:
  WHERE visits.agent_id = auth.uid()  ← Filtra só do user atual
  
Então supervisor veria VAZIO para focos de outros agentes
```

**Teste:** Agente A marca foco → Supervisor vê? Se não, é essa.

---

## 📊 FLUXO DE DADOS

### O que Deveria Acontecer

```
1. AGENTE MARCA FOCO
   ├─ Abre Propriedade
   ├─ Atividade: Survey
   ├─ Marca: "Foco Encontrado" ✓
   ├─ System: surveyData.hasFocus = true
   ├─ Click "Salvar"
   └─ INSERT/UPDATE visits: has_focus = TRUE
   
2. BANCO RECEBE E ARMAZENA
   ├─ visits.has_focus = TRUE ✓
   └─ Campo fica gravado

3. SUPERVISOR CONSULTA
   ├─ SELECT has_focus FROM visits
   ├─ Recebe: has_focus = TRUE ✓
   ├─ Filtra: v.has_focus = TRUE
   └─ Conta: focos++
   
4. DASHBOARD SUPERVISOR MOSTRA
   ├─ "Focos Encontrados: 3"
   └─ Mapa mostra pontos 🔴 vermelhos
```

### O que Está Acontecendo (Problema)

```
1. AGENTE MARCA FOCO
   ├─ Abre Propriedade
   ├─ Atividade: Survey
   ├─ Marca: "Foco Encontrado" ✓
   ├─ System: surveyData.hasFocus = ??? (pode ser falso!)
   ├─ Click "Salvar"
   └─ INSERT/UPDATE visits: has_focus = FALSE ❌
   
2. BANCO RECEBE E ARMAZENA
   ├─ visits.has_focus = FALSE ❌
   └─ Campo fica gravado errado

3. SUPERVISOR CONSULTA
   ├─ SELECT has_focus FROM visits
   ├─ Recebe: has_focus = FALSE ❌
   ├─ Filtra: v.has_focus == FALSE
   └─ Conta: (nada)
   
4. DASHBOARD SUPERVISOR MOSTRA
   ├─ "Focos Encontrados: 0" ❌
   └─ Mapa vazio de focos ❌
```

---

## ✅ AÇÕES RECOMENDADAS

### Ação 1: Verificar se Campo Existe (5 min)

No Supabase console → SQL:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'visits'
ORDER BY ordinal_position;
```

**O que procurar:**
```
✓ has_focus | boolean | not null
```

Se não aparecer → 🚨 Adicioná-lo imediatamente

---

### Ação 2: Verificar RLS Policy (10 min)

Supabase → Auth → Policies → Tabela "visits":

```sql
-- Se policy for restritiva:
CREATE POLICY "Agentes veem apenas suas visitas"
ON visits FOR SELECT
USING (auth.uid() = agent_id);

-- Deveria ser:
CREATE POLICY "Supervisores veem visitas da equipe"
ON visits FOR SELECT
USING (
  auth.uid() = agent_id  -- Agentes veem suas
  OR EXISTS (            -- Supervisores veem da equipe
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.role IN ('supervisor', 'coordenador', 'admin_master')
  )
);
```

---

### Ação 3: Verificar Valor Real no Banco (10 min)

Supabase → SQL:
```sql
SELECT 
  id, agent_id, status, activity_type, has_focus, visit_date
FROM visits
WHERE agent_id IN (SELECT id FROM profiles WHERE role = 'agente')
LIMIT 10;
```

**O que verificar:**
```
❌ Todos com has_focus = NULL → Campo não está sendo preenchido
❌ Todos com has_focus = FALSE → Campo é FALSE mesmo com foco
✓ Alguns com has_focus = TRUE → OK! Problema é RLS
```

---

### Ação 4: Testar Fluxo Completo (15 min)

1. **Agente:**
   - Abra propriedade
   - Selecione "Survey"
   - Abra DevTools → Console
   - Clique "Foco Encontrado"
   - Veja se `surveyData.hasFocus` muda para TRUE
   - Click "Salvar"
   - Veja no Network se request contém `has_focus: true`

2. **Supervisor:**
   - Abra Dashboard
   - DevTools → Network → aba "visits"
   - Veja se resposta tem `has_focus: true`

---

## 🎯 PRÓXIMOS PASSOS

```
URGÊNCIA: 🔴 ALTA

1. ✅ Verificar se coluna has_focus existe [Ação 1]
2. ✅ Verificar RLS policies [Ação 2]
3. ✅ Consultar banco diretamente [Ação 3]
4. ✅ Testar fluxo completo [Ação 4]

Esperado: Encontrar a causa em 30 min
```

---

## 📝 CHECKLIST DE VERIFICAÇÃO

```
□ Coluna has_focus existe em visits?
□ Coluna é boolean (não string)?
□ RLS Policy permite SELECT para supervisor/admin?
□ INSERT/UPDATE contém has_focus = true?
□ surveyData.hasFocus atualiza corretamente?
□ Form não reseta o valor antes de salvar?
□ Network request mostra has_focus correto?
□ SELECT do banco retorna has_focus correto?
```

---

## 📊 IMPACTO

```
Agora:
  ❌ Dashboard vazio de focos
  ❌ Mapa sem marcadores vermelhos
  ❌ Supervisor não vê produtividade real
  ❌ Coordenador não acompanha situação

Se for RLS:
  🔧 2 min para corrigir (1 SQL)
  
Se for campo não populado:
  🔧 5 min para encontrar e fixar
  
Se for formulário:
  🔧 15 min para debugar onChange
```

---

**Conclusão:** Problema identificado mas causa ainda desconhecida. Executar ações 1-4 acima para diagnosticar. Provavelmente será RLS Policy ou campo não sendo populado.
