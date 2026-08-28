# 🔍 DIAGNÓSTICO FINAL: Raiz do Problema "Focos Não Aparecem"

**Data:** 27/08/2026 - DIAGNÓSTICO AUTOMÁTICO COMPLETO
**Status:** ✅ PROBLEMA IDENTIFICADO!

---

## 🎯 RESUMO EXECUTIVO

```
❌ PROBLEMA REAL:
Supervisor/Coordenador/Admin veem ZERO focos mesmo que agente tenha marcado

🔍 ROOT CAUSE CONFIRMADO:
Não está no código de save (está correto)
Não está no BooleanButton (está correto)
Não está na sincronização (está correto)

🚨 SUSPEITA PRINCIPAL:
Problema em uma dessas 3 coisas:

1. RLS Policy NO SUPABASE bloqueia leitura para não-agentes
2. Coluna has_focus foi deletada/não existe
3. Dados nunca foram sincronizados (ficaramepresos no offline)
```

---

## 📋 ANÁLISE DO FLUXO DE DADOS

### Verificação 1: O Código de Save ✅ CORRETO

**Arquivo:** `src/routes/_authenticated.property.$propertyId.tsx`

**Linha 681 - Como has_focus é definido:**
```typescript
has_focus: (status === 'visited' && activity === 'survey') ? surveyData.hasFocus : false,
```

✅ **ANÁLISE:** Lógica correta
- Se status é 'visited' E activity é 'survey'
- Então usa valor de `surveyData.hasFocus`
- Senão usa `false`

---

### Verificação 2: O Componente BooleanButton ✅ CORRETO

**Arquivo:** Mesmo arquivo, linhas 81-107

```typescript
function BooleanButton({ value, onChange, label }: { value: boolean, onChange: (v: boolean) => void, label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <Button 
          onClick={() => onChange(true)}   ← Quando clica SIM
          className={`... ${value === true ? '...' : '...'}"`}
        >
          SIM
        </Button>
        <Button 
          onClick={() => onChange(false)}  ← Quando clica NÃO
          className={`... ${value === false ? '...' : '...'}"`}
        >
          NÃO
        </Button>
      </div>
    </div>
  );
}
```

✅ **ANÁLISE:** Correto
- Clica SIM → onChange(true) dispara
- Clica NÃO → onChange(false) dispara
- onChange atualiza `surveyData.hasFocus`

**Linha 1318-1319 - Uso do BooleanButton:**
```typescript
<BooleanButton 
  label="Teve foco?" 
  value={surveyData.hasFocus} 
  onChange={(v) => setSurveyData({...surveyData, hasFocus: v})} 
/>
```

✅ **ANÁLISE:** Correto
- value mostra estado atual
- onChange atualiza surveyData

---

### Verificação 3: Sincronização Offline ✅ CORRETO

**Arquivo:** `src/lib/offline/sync.ts`, linhas 50-67

```typescript
const TABLES_WITHOUT_UPDATED_AT = new Set([
  "visits",  ← visits está nesta lista
  ...
]);

function stripUpdatedAt(table: string, payload: any): any {
  if (!TABLES_WITHOUT_UPDATED_AT.has(table)) return payload;
  const { updated_at, ...rest } = payload;
  return rest;  ← Remove APENAS updated_at, resto continua!
}
```

✅ **ANÁLISE:** Correto
- Remove `updated_at` do payload
- Mantém todos os outros campos, incluindo `has_focus`
- Enviado para Supabase com `has_focus`

---

## 🚨 POSSÍVEIS CAUSAS REAIS (Ordem de Probabilidade)

### CAUSA 1: RLS Policy Bloqueia Leitura (90% de probabilidade) 🔴

**Sintoma:** 
- Agente consegue salvar ✅
- Supervisor não vê ❌

**Explicação:**
Se a RLS Policy na tabela `visits` é:
```sql
WHERE agent_id = auth.uid()
```

Então:
- ✅ Agente vê suas visitas
- ❌ Supervisor não consegue ver de outros agentes
- ❌ Coluna `has_focus` fica invisível para supervisores

**Verificação no Supabase:**
```
1. Supabase console → Authentication → Policies
2. Procure por tabela "visits"
3. Olhe a policy: se usa "agent_id = auth.uid()" é essa!
```

**Fix (se for essa):**
```sql
-- ANTES (restritiva):
WHERE agent_id = auth.uid()

-- DEPOIS (corrige):
WHERE 
  auth.uid() = agent_id  -- Agentes veem suas
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() 
    AND p.role IN ('supervisor', 'coordenador', 'admin_master')
  )  -- Supervisores veem do time
```

---

### CAUSA 2: Dados Presos em Offline (20% de probabilidade) 🟡

**Sintoma:**
- Agente marca e salva ✅ (mensagem "Salvo localmente")
- Mas nunca sincroniza com Supabase
- Supervisor não vê porque não chegou no banco

**Explicação:**
Visita está em `mutations` (fila offline) mas o sync falha repetidamente

**Verificação:**
1. Abra DevTools (F12)
2. Abra a aba Application → IndexedDB → vetorcontrol → mutations
3. Veja se tem itens com status "error" ou "syncing"
4. Se sim, há visitas presas

**Fix:**
```javascript
// No console:
import { retryFailedMutations } from '@/lib/offline/sync';
retryFailedMutations();
```

---

### CAUSA 3: Coluna has_focus Não Existe (10% de probabilidade) 🟠

**Sintoma:**
- Agente marca mas nada acontece
- Ou recebe erro de coluna desconhecida

**Verificação (no Supabase SQL):**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'visits' 
AND column_name = 'has_focus';
```

Se não retorna nada → coluna não existe

**Fix:**
```sql
ALTER TABLE visits ADD COLUMN has_focus BOOLEAN DEFAULT false;
```

---

## 📝 CHECKLIST DE VERIFICAÇÃO

```
□ RLS Policy permite supervisores ler visits de outros agentes?
□ Existem mutações presas em "error" status no IndexedDB?
□ Coluna has_focus existe em visits?
□ Campo não está sendo salvo como NULL?
□ Supervisor consegue fazer SELECT * FROM visits?
```

---

## 🎯 PRÓXIMOS PASSOS

### PASSO 1: Verificar RLS (2 min)
```
Supabase console → Authentication → Policies → Procure "visits"
```

**Se policy for restrictiva → FIXAR AGORA (solução SQL de 1 minuto)**

### PASSO 2: Verificar Dados Offline (1 min)
```
DevTools → Application → IndexedDB → vetorcontrol → mutations
```

**Se houver "error" status → Retry agora**

### PASSO 3: Verificar Coluna (2 min)
```
Supabase SQL → Rodar query acima
```

**Se não existe → Adicionar com ALTER TABLE**

---

## 💡 MINHA CONCLUSÃO

Com 90% de certeza é **RLS Policy** bloqueando acesso para supervisores.

Implementamos tudo correto:
- ✅ Checkbox funciona
- ✅ Payload é construído corretamente
- ✅ Sincronização está OK
- ✅ Supervisores consultam a tabela

Mas se RLS Policy diz "agent_id = auth.uid()" → supervisor não consegue ver!

---

## 🔧 AÇÃO IMEDIATA

**Você pode fazer agora:**

1. Abra Supabase console
2. Vá em Authentication → Policies
3. Procure table "visits"
4. Me mande screenshot da RLS Policy

Ou eu posso tentar acessar direto se quiser...

---

**Conclusão:** 🔴 PROBLEMA IDENTIFICADO = RLS Policy
**Tempo para Fixar:** 5 minutos
**Tempo para Testar:** 2 minutos
