# 🗄️ Guia SQL: Vincular Supervisores ao Coordenador

**Data:** 28/08/2026  
**Problema:** Coordenador novo adicionado, mas supervisores não têm `coordinator_id` preenchido  
**Solução:** Executar SQL para vincular supervisores ao coordenador

---

## 📋 Situação

```
Coordenador novo criado:
├─ Nome: Denis
├─ Email: denis@...
├─ Role: coordenador
├─ ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Supervisores existentes:
├─ Supervisor A
├─ Supervisor B
├─ ... (sem coordinator_id preenchido)

Problema:
└─ coordinator_id = NULL (vazio)
└─ Coordenador não consegue ver dados
```

---

## 🎯 Objetivo

Preencher `coordinator_id` nos supervisores para:
1. Vincular supervisores ao coordenador
2. Ativar filtro de segurança rigoroso
3. Coordenador conseguir trabalhar normalmente

---

## 🔧 Como Executar SQL

### Passo 1: Acessar Supabase

```
1. Ir para: https://app.supabase.com
2. Projeto: ttjzgszxrnmcsygtzfcu
3. Menu esquerdo: SQL Editor
4. Colar SQL abaixo
5. Clique em "Run" (ou Ctrl+Enter)
```

---

## 📝 SQL - Opção 1: Vincular Supervisores Específicos

```sql
-- ⚠️ SUBSTITUIR OS VALORES ABAIXO:
-- COORDINATOR_ID: ID do coordenador (Denis)
-- SUPERVISOR_IDS: IDs dos supervisores para vincular

UPDATE profiles
SET coordinator_id = 'COORDINATOR_ID_AQUI'
WHERE id IN ('SUPERVISOR_ID_1', 'SUPERVISOR_ID_2', '...')
AND role = 'supervisor';

-- Exemplo real:
UPDATE profiles
SET coordinator_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE id IN (
  'supervisor-id-1',
  'supervisor-id-2'
)
AND role = 'supervisor';
```

---

## 📝 SQL - Opção 2: Vincular TODOS os Supervisores ao Coordenador

```sql
-- ⚠️ USAR SÓ SE: todos supervisores devem pertencer a este coordenador
-- SUBSTITUIR: COORDINATOR_ID

UPDATE profiles
SET coordinator_id = 'COORDINATOR_ID_AQUI'
WHERE role = 'supervisor'
AND coordinator_id IS NULL;

-- Exemplo real:
UPDATE profiles
SET coordinator_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE role = 'supervisor'
AND coordinator_id IS NULL;
```

---

## 🔍 SQL - Verificar Antes de Executar

```sql
-- Ver COORDINATOR_ID (copiar valor)
SELECT id, email 
FROM profiles 
WHERE role = 'coordenador' 
AND full_name LIKE '%Denis%';

-- Ver SUPERVISOR IDs
SELECT id, full_name, coordinator_id 
FROM profiles 
WHERE role = 'supervisor';

-- Ver agentes (para referência)
SELECT id, full_name, supervisor_id 
FROM profiles 
WHERE role = 'agente' 
LIMIT 10;
```

---

## 🎯 Passo a Passo Completo

### 1️⃣ Descobrir IDs Necessários

```sql
-- Copiar ID do Coordenador
SELECT id, email, full_name 
FROM profiles 
WHERE role = 'coordenador'
AND full_name LIKE '%Denis%';

-- RESULTADO: Copiar o ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
```

**Copie o ID que aparecer!**

---

### 2️⃣ Descobrir IDs dos Supervisores

```sql
-- Listar supervisores e seus IDs
SELECT id, full_name, email, coordinator_id 
FROM profiles 
WHERE role = 'supervisor'
ORDER BY full_name;

-- RESULTADO: Você verá lista como:
-- | id                                   | full_name      | email         | coordinator_id |
-- | a1b2c3d4-e5f6-7890-abcd-ef1234567890 | Supervisor A   | sup_a@...     | NULL           |
-- | b2c3d4e5-f6a7-8901-bcde-f12345678901 | Supervisor B   | sup_b@...     | NULL           |
-- ...

-- Copie os IDs que tem coordinator_id = NULL
```

---

### 3️⃣ Executar UPDATE

```sql
-- Substituir pelos IDs reais que você copiou:
UPDATE profiles
SET coordinator_id = 'ID_COORDENADOR_AQUI'
WHERE id IN (
  'ID_SUPERVISOR_1_AQUI',
  'ID_SUPERVISOR_2_AQUI',
  'ID_SUPERVISOR_3_AQUI'
)
AND role = 'supervisor';

-- EXEMPLO:
UPDATE profiles
SET coordinator_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE id IN (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'b2c3d4e5-f6a7-8901-bcde-f12345678901'
)
AND role = 'supervisor';
```

---

### 4️⃣ Verificar Resultado

```sql
-- Ver se ficou correto
SELECT id, full_name, coordinator_id 
FROM profiles 
WHERE role = 'supervisor'
ORDER BY full_name;

-- ESPERADO:
-- | id                | full_name      | coordinator_id         |
-- | ...               | Supervisor A   | a1b2c3d4-e5f6-... ✅   |
-- | ...               | Supervisor B   | a1b2c3d4-e5f6-... ✅   |
-- ...
```

---

## ⚡ Atalho: Uma Query Completa

Se você quer copiar-colar e ajustar apenas 2 valores:

```sql
-- SUBSTITUIR APENAS:
-- 1. SEU_COORDINATOR_ID → ID do coordenador
-- 2. SUPERVISOR_ID_1, SUPERVISOR_ID_2, ... → IDs dos supervisores

UPDATE profiles
SET coordinator_id = 'SEU_COORDINATOR_ID'
WHERE id IN (
  'SUPERVISOR_ID_1',
  'SUPERVISOR_ID_2',
  'SUPERVISOR_ID_3'
)
AND role = 'supervisor';

-- Verificar:
SELECT id, full_name, coordinator_id FROM profiles WHERE role = 'supervisor';
```

---

## 🔐 Segurança

### O Que Este SQL Faz

```
✅ Preenche campo coordinator_id
✅ Apenas em supervisores
✅ Apenas role = 'supervisor'
✅ Não deleta nada
✅ Não modifica agentes
```

### O Que NÃO Faz

```
❌ Não altera outros campos
❌ Não deleta supervisores
❌ Não afeta agentes/coordenadores
❌ Reversível (pode ser mudado depois)
```

---

## 📊 Antes vs Depois

### ANTES (Sem executor)

```
Coordenador Denis:
├─ Painel: 0 supervisores ❌
├─ Equipe: 0 agentes ❌
└─ Dados: vazios ❌

Supervisores no banco:
└─ coordinator_id = NULL (vazio)
```

### DEPOIS (SQL executado)

```
Coordenador Denis:
├─ Painel: 2 supervisores ✅
├─ Equipe: N agentes ✅
└─ Dados: completos ✅

Supervisores no banco:
└─ coordinator_id = 'a1b2...' (preenchido!)
```

---

## ✨ Resultado da Mudança

### Modo Compatibilidade → Modo Rigoroso

```
ANTES (Compatibilidade):
├─ Coordenador vê TODOS supervisores
├─ Mostra todos dados (provisório)
└─ Console: "PERMISSIVO - Coordenador novo"

DEPOIS (Rigoroso):
├─ Coordenador vê SEUS supervisores
├─ Máxima segurança
└─ Console: "RIGOROSO - Supervisores vinculados"
```

---

## 🚀 Próximos Passos

### Imediato (Agora)

```
1. Executar SQL acima ✅
2. Verificar resultado no SQL Editor
3. Fechar o diálogo SQL
```

### 1 min depois

```
1. Recarregar app (F5)
2. Coordenador abre painel
3. Vê: dados completos! ✅
4. Console mostra: "RIGOROSO" ✅
```

---

## 🆘 Se Errar

### Desfazer: Limpar coordinator_id

```sql
-- Se executou errado, pode desfazer:
UPDATE profiles
SET coordinator_id = NULL
WHERE role = 'supervisor'
AND coordinator_id = 'COORDINATOR_ID_QUE_ERROU';

-- Depois execute novamente com valores corretos
```

---

## 💡 Dicas

### Dica 1: Copiar IDs

```
Não digite manualmente!
1. Execute query
2. Passe o mouse sobre o ID
3. Clique para copiar
4. Cole no UPDATE
```

### Dica 2: Testar com 1 Supervisor

```
Antes de vincular TODOS:
1. Execute UPDATE com 1 supervisor
2. Teste se coordenador consegue ver
3. Se OK: vincule os outros
```

### Dica 3: Usar Wildcard (com cuidado!)

```
Se coordenador deve gerenciar TODOS supervisores:
UPDATE profiles
SET coordinator_id = 'COORDINATOR_ID'
WHERE role = 'supervisor'
AND coordinator_id IS NULL;
-- Cuidado: vincula TODOS os supervisores!
```

---

## 🔍 Validação

### Checklist Após Executar

```
☑️ SQL executou sem erro?
☑️ "Updated N rows" apareceu?
☑️ Query de verificação mostra coordinator_id preenchido?
☑️ Coordenador fez login novamente?
☑️ Painel mostra dados agora?
☑️ Console mostra "RIGOROSO"?
```

---

## ✅ Conclusão

```
SQL executado com sucesso:
├─ Supervisores vinculados ao coordenador
├─ Modo Compatibilidade → Modo Rigoroso
├─ Coordenador consegue trabalhar
└─ Sistema em máxima segurança! ✅

Tempo: ~30 segundos
Dificuldade: ⭐ Muito Fácil
Resultado: ✅ Problema 100% resolvido!
```

---

**Pronto para executar! Copie-cole, ajuste IDs e run!** 🚀
