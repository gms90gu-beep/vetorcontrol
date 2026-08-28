# 🔍 Como Executar o Diagnóstico dos 4 Passos

## ⚡ RÁPIDO (3 minutos)

### Passo A: Abrir a Aplicação
```
1. Acesse: https://vetorcontrol.lovable.app
2. Faça login como AGENTE
3. Você NÃO precisa fazer nada no app, só estar logado
```

### Passo B: Abrir DevTools (F12)
```
Windows/Linux: F12
Mac: Cmd + Option + I
```

### Passo C: Ir para Console
```
1. Clique na aba "Console" (no topo do DevTools)
2. Você verá um terminal preto com texto colorido
```

### Passo D: Executar o Script
```
1. Copie TODO o conteúdo do arquivo:
   /home/claude/vetorcontrol/SCRIPT_DIAGNOSTICO_FOCOS.js

2. Cole no console (Ctrl+V ou Cmd+V)

3. Pressione Enter

4. AGUARDE 5-10 segundos
```

### Passo E: Copiar Resultado
```
1. Selecione TODA a saída (Ctrl+A)
2. Copie (Ctrl+C)
3. Me mande por chat
```

---

## 📊 O que o Script Testa

```
✅ PASSO 1: Verifica se surveyData.hasFocus atualiza corretamente
   └─ Resultado esperado: TRUE quando marcado

✅ PASSO 2: Consulta o banco direto (Supabase)
   └─ Vê se has_focus está como TRUE, FALSE, ou NULL

✅ PASSO 3: Testa RLS Policy
   └─ Verifica se você consegue acessar dados de outros usuários

✅ PASSO 4: Simula payload de envio
   └─ Mostra como o JSON é construído
```

---

## 📋 O que Você Vai Ver

### Se Tudo OK ✅
```
✅ PASSO 1 OK: hasFocus atualiza corretamente para TRUE
✅ PASSO 2 OK: Existem visitas com has_focus = TRUE no banco!
✅ PASSO 3 OK: RLS Policy permite leitura de dados
✅ PASSO 4: Se este JSON foi gerado com has_focus=true, está OK!
```

### Se Tem Problema ❌
```
❌ PASSO 1 FALHA: hasFocus não está TRUE
  ↓ Significa: O checkbox não atualiza surveyData
  ↓ Solução: Fixar o onChange do checkbox

❌ PASSO 2 FALHA: has_focus está FALSE
  ↓ Significa: Está sendo salvo como FALSE sempre
  ↓ Solução: Corrigir lógica de INSERT

❌ PASSO 3 FALHA: RLS Policy está bloqueando
  ↓ Significa: Supervisor não consegue ver
  ↓ Solução: Atualizar RLS Policy
```

---

## 🎯 Depois de Mandar a Saída

Quando você me enviar a saída do script:

1. Eu vou ver exatamente qual PASSO falha
2. Vou identificar o código responsável
3. Vou fazer o fix (1-5 minutos)
4. Vou fazer o commit e push
5. Lovable vai fazer deploy automático
6. ✅ Problema resolvido!

---

## ⚠️ Erros Comuns

### "Supabase client não encontrado"
```
Significa: Você não fez login ainda
Solução: Faça login como agente primeiro, depois execute
```

### "Error: Unauthorized"
```
Significa: Sua chave pública não tem permissão
Isso é ESPERADO - significa que RLS Policy está funcionando!
```

### Console vazio
```
Significa: Script rodou em background
Solução: Aguarde 5 segundos e procure a saída abaixo
```

---

## 🚀 Estou Pronto!

Quando você executar e me mandar a saída, vou:
- Identificar a causa em 30 segundos
- Fixar em 5 minutos
- Push em 1 minuto
- Deploy automático em 5 minutos

**TEMPO TOTAL:** 15 minutos até estar resolvido! ⚡

---

**Vai lá! Execute o script agora!** 👇
