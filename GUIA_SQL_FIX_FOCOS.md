# 🔧 GUIA: Executar SQL Fix para Focos Aparecerem

**Duração:** 5 minutos
**Dificuldade:** Muito Fácil (Copiar e Colar)
**Resultado:** Supervisores/Coordenadores verão focos! ✅

---

## 🚀 PASSO 1: Abrir Supabase SQL Editor

```
1. Abra: https://app.supabase.com
2. Selecione o projeto: ttjzgszxrnmcsygtzfcu
3. No menu esquerdo, clique em "SQL Editor"
4. Clique em "New query" (botão azul)
```

Você deve ver um editor vazio preto/cinzento.

---

## 📋 PASSO 2: Copiar o SQL Fix

**Copie TUDO isto abaixo:**

```sql
-- 🔧 FIX AUTOMÁTICO: RLS Policy para Focos

-- DELETAR policies antigas que bloqueiam
DROP POLICY IF EXISTS "Agents can view their own visits" ON visits;
DROP POLICY IF EXISTS "Agentes veem apenas suas visitas" ON visits;
DROP POLICY IF EXISTS "Agents only" ON visits;

-- CRIAR policy CORRIGIDA (permite supervisores)
CREATE POLICY "Acesso baseado em role e equipe"
ON visits
FOR SELECT
USING (
  auth.uid() = agent_id
  OR
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('supervisor', 'coordenador', 'admin_master')
  )
);

-- VERIFICAR que foi criada
SELECT policyname, permissive
FROM pg_policies
WHERE tablename = 'visits'
ORDER BY policyname;
```

---

## 🖱️ PASSO 3: Colar no SQL Editor

1. **Clique** no editor (área branca/preta)
2. **Cole** (Ctrl+V ou Cmd+V)
3. Você deve ver o SQL completo lá

---

## ▶️ PASSO 4: Executar

1. **Clique no botão azul "Execute"** (canto superior direito)
   - Ou pressione `Ctrl+Enter` / `Cmd+Enter`

2. **Aguarde 3-5 segundos**
   - Você verá a saída aparecendo embaixo

---

## ✅ PASSO 5: Verificar Resultado

Você deve ver:

```
Query 1 (DROP POLICY): no error ✓
Query 2 (DROP POLICY): no error ✓
Query 3 (DROP POLICY): no error ✓
Query 4 (CREATE POLICY): no error ✓
Query 5 (SELECT): Results:
  ┌─────────────────────────────────────────┐
  │ policyname                              │
  │─────────────────────────────────────────│
  │ Acesso baseado em role e equipe        │
  │─────────────────────────────────────────│
  │ permissive: true                        │
  └─────────────────────────────────────────┘
```

**Se ver isso → ✅ SUCCESS! A policy foi criada!**

---

## ⚠️ Erros Possíveis e Soluções

### ❌ "policy does not exist"

```
Erro: ERROR: policy "..." does not exist
Motivo: Policy com outro nome ou já foi deletada
Solução: Ignore! Continue com CREATE POLICY
Ação: Copie só a parte de CREATE POLICY abaixo ↓
```

**Se receber erro, cole APENAS isto:**

```sql
DROP POLICY IF EXISTS "Agents can view their own visits" ON visits;
DROP POLICY IF EXISTS "Agentes veem apenas suas visitas" ON visits;
DROP POLICY IF EXISTS "Agents only" ON visits;
DROP POLICY IF EXISTS "Acesso baseado em role e equipe" ON visits;

CREATE POLICY "Acesso baseado em role e equipe"
ON visits
FOR SELECT
USING (
  auth.uid() = agent_id
  OR
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('supervisor', 'coordenador', 'admin_master')
  )
);
```

### ❌ "relation visits does not exist"

```
Motivo: Tabela visits não existe (muito raro)
Solução: Verifique projeto - pode estar no banco errado
```

### ❌ "syntax error"

```
Motivo: Algo foi copiado errado
Solução: Limpe tudo (Ctrl+A, Delete) e copie novamente com cuidado
```

---

## 🎯 PASSO 6: Testar no App

Depois de executar o SQL:

1. **Abra o app:** https://vetorcontrol.lovable.app
2. **Faça logout** (se estava logado)
3. **Login como SUPERVISOR**
4. **Vá para Dashboard de Supervisão**
5. **Procure por "Focos"**

**Antes:** 0 focos ❌
**Depois:** Números corretos ✅

---

## 📊 ANTES vs DEPOIS

### ANTES (RLS Bloqueando)
```
Dashboard Supervisor:
├─ Agentes: 5
├─ Visitas: 48
├─ Focos: 0 ❌ ← Errado! Deveria ter focos
└─ Fechados: 12
```

### DEPOIS (RLS Corrigido)
```
Dashboard Supervisor:
├─ Agentes: 5
├─ Visitas: 48
├─ Focos: 7 ✅ ← Correto! Agora aparecem
└─ Fechados: 12
```

---

## 🔍 Verificações Adicionais (Opcionais)

Se quiser verificar mais coisas, execute isto também:

```sql
-- Ver todas as policies da tabela visits
SELECT policyname, qual, permissive
FROM pg_policies
WHERE tablename = 'visits';

-- Ver dados reais (primeiras 5 visitas com focos)
SELECT 
    id, 
    agent_id, 
    has_focus, 
    visit_date
FROM visits
WHERE has_focus = true
LIMIT 5;

-- Contar focos por agente
SELECT 
    COUNT(CASE WHEN has_focus = true THEN 1 END) as total_focos
FROM visits;
```

---

## ✨ Resumo

```
┌─────────────────────────────────────────────────────────┐
│ 5 PASSOS SIMPLES:                                       │
├─────────────────────────────────────────────────────────┤
│ 1️⃣ Abrir Supabase SQL Editor                          │
│ 2️⃣ Copiar SQL Fix (acima)                             │
│ 3️⃣ Colar no editor                                     │
│ 4️⃣ Executar (botão azul)                              │
│ 5️⃣ Testar no app (reload)                             │
│                                                         │
│ ✅ RESULTADO: Supervisor vê focos!                     │
│ ⏱️ TEMPO: 5 minutos                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🆘 Se não funcionar

Se depois de executar o SQL ainda não aparecer:

1. **Reload a página** (F5)
2. **Logout e login novamente**
3. **Limpar cache** (Ctrl+Shift+Delete)
4. **Tentar em navegador privado/incógnito**

Se ainda não funcionar:
- Me mande screenshot do resultado do SQL
- Vou investigar outra causa

---

**Está pronto? Vá lá e execute!** 🚀
