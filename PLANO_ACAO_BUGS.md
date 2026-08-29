# 📋 Plano de Ação: Corrigir Bugs Identificados

**Data:** 28/08/2026  
**Prioridade:** Alta  
**Timeline:** 2-4 semanas

---

## 📊 Resumo

| Bug | Severidade | Qtd | Tempo | Prioridade |
|-----|-----------|-----|-------|-----------|
| console.log | ⚠️ Média | 650 | 2-3h | 🔴 AGORA |
| Memory Leaks | ⚠️ Média | 165 | 4-6h | 🔴 AGORA |
| any types | ⚠️ Média | 548 | 8-10h | 🟡 Semana 1 |
| Magic numbers | 🟡 Baixa | 121 | 2h | 🟡 Semana 2 |
| TODO/FIXME | 🟡 Baixa | 13 | 1h | 🟢 Depois |

---

## 🔴 PRIORIDADE 1: FAZER AGORA (4-5 horas)

### 1.1 Remover/Condicionar console.log (2-3 horas)

**Arquivos afetados:** 650 instâncias em múltiplos arquivos

**Opção A: Condicionar para desenvolvimento**
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log(...);
}
```

**Opção B: Usar logger profissional** (Melhor)
```typescript
import logger from '@/lib/logger';
logger.debug(...);
```

**Passos:**
1. Criar `src/lib/logger.ts`
2. Implementar logger (pino ou winston)
3. Substituir todos console.log
4. Testar em produção

**Arquivo para implementar:**
```typescript
// src/lib/logger.ts
import pino from 'pino';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

export default logger;
```

**Script para substituição:**
```bash
# Encontrar todos console.log
grep -r "console\.log" src/ --include="*.ts" --include="*.tsx" > /tmp/console_logs.txt

# Revisar e substituir manualmente ou com sed
sed -i 's/console\.log(/logger.debug(/g' src/components/**/*.tsx
```

---

### 1.2 Adicionar Cleanup em useEffect (4-6 horas)

**Arquivos críticos para começar:**
1. `src/components/DailyWorkCloser.tsx` (30+ useEffect)
2. `src/components/rg/RGOperationalMap.tsx` (20+ useEffect)
3. `src/components/field-work/OperationalPanel.tsx` (15+ useEffect)
4. `src/lib/offline/sync.ts` (10+ useEffect)

**Padrão de correção:**

```typescript
// ❌ ANTES
useEffect(() => {
  const subscription = supabase
    .from('table')
    .on('*', () => handleChange())
    .subscribe();
}, []);

// ✅ DEPOIS
useEffect(() => {
  const subscription = supabase
    .from('table')
    .on('*', () => handleChange())
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, [dependencies]);
```

**Script para encontrar e listar:**
```bash
grep -rn "useEffect" src/ --include="*.tsx" --include="*.ts" | grep -v "return () =>" > /tmp/useeffect_review.txt
```

**Checklist:**
- [ ] Revisar cada useEffect
- [ ] Adicionar return () => {} quando necessário
- [ ] Testar navegação entre páginas
- [ ] Monitorar memória no DevTools

---

## 🟡 PRIORIDADE 2: PRÓXIMA SEMANA (8-10 horas)

### 2.1 Definir Tipos TypeScript (any → interfaces)

**Arquivos principais:**
- `src/components/field-work/OperationalPanel.tsx` (50+ any)
- `src/components/supervision/SupervisionDashboard.tsx` (30+ any)
- `src/lib/wave-c.functions.ts` (40+ any)

**Padrão:**
```typescript
// ❌ ANTES
const fetchProfiles = async (data: any) => {
  return data.map((p: any) => p.full_name);
};

// ✅ DEPOIS
interface Profile {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

const fetchProfiles = async (data: Profile[]) => {
  return data.map((p) => p.full_name);
};
```

**Arquivos de tipos a criar:**
```typescript
// src/types/index.ts
export interface Profile { ... }
export interface Visit { ... }
export interface Cycle { ... }
export interface FocusReport { ... }
```

**Configurar ESLint:**
```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

---

### 2.2 Configurar ESLint Rules

**Instalação:**
```bash
npm install --save-dev eslint-plugin-react-hooks
```

**Configuração (.eslintrc.json):**
```json
{
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

---

### 2.3 Implementar Logger Profissional

**Package.json:**
```bash
npm install pino pino-pretty
npm install --save-dev @types/pino
```

**Criar:** `src/lib/logger.ts`
```typescript
import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

const logger = pino(
  isDev
    ? {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }
    : {
        level: 'error',
      }
);

export default logger;
```

**Uso em componentes:**
```typescript
import logger from '@/lib/logger';

// Em vez de console.log
logger.debug('[COORDINATOR_RPC] Dados carregados', { count: data.length });
logger.info('Sincronização iniciada');
logger.warn('Possível problema', { issue: 'timeout' });
logger.error('Erro crítico', error);
```

---

## 🟢 PRIORIDADE 3: PRÓXIMO MÊS (5-6 horas)

### 3.1 Remover Magic Numbers

**Criar:** `src/lib/constants.ts`
```typescript
export const DEBOUNCE_MS = 300;
export const SYNC_TIMEOUT_MS = 5000;
export const MAX_RETRY_ATTEMPTS = 3;
export const MIN_ARRAY_SIZE = 1;
export const PAGE_SIZE = 50;

export enum HTTP_STATUS {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  CONFLICT = 409,
  SERVER_ERROR = 500,
}

export const COLORS = {
  FOCUS: "#dc2626",
  PENDING: "#f97316",
  CLOSED: "#f97316",
  STRATEGIC: "#3b82f6",
  CLEAN: "#10b981",
};
```

**Substituir nos componentes:**
```typescript
// ❌ ANTES
setTimeout(() => { ... }, 5000);

// ✅ DEPOIS
setTimeout(() => { ... }, SYNC_TIMEOUT_MS);
```

---

### 3.2 Resolver TODO/FIXME

**Criar GitHub Issues:**

1. **Issue:** "Modo Compatibilidade Coordenador"
   - Arquivo: `CoordinatorDashboard.tsx`
   - Descrição: Remover modo compatibilidade quando coordinator_id estiver sempre preenchido
   - Prioridade: Média
   
2. **Issue:** "Vincular Supervisores - SQL Migration"
   - Arquivo: N/A
   - Descrição: Preencher coordinator_id de supervisores no banco
   - Prioridade: Alta

---

### 3.3 Adicionar Testes Unitários

**Começar com componentes críticos:**
```typescript
// src/components/DailyWorkCloser.test.tsx
describe('DailyWorkCloser', () => {
  test('deve iniciar sessão', () => {
    // Teste aqui
  });

  test('deve sincronizar dados', () => {
    // Teste aqui
  });

  test('deve tratar erros', () => {
    // Teste aqui
  });
});
```

---

## 📅 Cronograma Proposto

### Semana 1
- [ ] Seg-Ter: Remover console.log (2-3h)
- [ ] Ter-Qua: Adicionar cleanup useEffect (4-6h)
- [ ] Qua: Configurar ESLint (1h)
- [ ] Qui-Sex: Implementar logger (2h)

### Semana 2-3
- [ ] Definir tipos TypeScript (8-10h)
- [ ] Revisão de código
- [ ] Testes

### Semana 4
- [ ] Remover magic numbers (2h)
- [ ] Resolver TODO/FIXME (1h)
- [ ] Merge das mudanças
- [ ] Deploy

---

## 🔧 Ferramentas Recomendadas

```bash
# ESLint + TypeScript
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser

# Logger
npm install pino pino-pretty

# Testes
npm install --save-dev vitest @testing-library/react

# Type checking
npm install --save-dev typescript

# Performance monitoring
npm install @sentry/react
```

---

## ✅ Checklist de Execução

### Antes de começar:
- [ ] Criar branch `fix/code-quality`
- [ ] Documentar alterações em changelog
- [ ] Informar team sobre mudanças

### Durante:
- [ ] Fazer commits pequenos e frequentes
- [ ] Testar cada alteração
- [ ] Revisar código antes de merge

### Depois:
- [ ] Merge para main
- [ ] Deploy em staging
- [ ] Testes finais
- [ ] Deploy em produção

---

## 📊 Métricas de Sucesso

| Métrica | Antes | Depois | Prazo |
|---------|-------|--------|-------|
| console.log (prod) | 650 | 0 | Semana 1 |
| useEffect cleanup | 40/205 | 205/205 | Semana 1 |
| any types | 548 | < 50 | Semana 2-3 |
| ESLint errors | N/A | 0 | Semana 1 |
| Test coverage | ? | > 70% | Semana 4+ |

---

## 🎯 Resultado Final

Após implementar todas as ações:

```
✅ Código limpo e manutenível
✅ Memory leaks eliminados
✅ Type safety melhorado
✅ Logging profissional
✅ ESLint strict
✅ Testes cobrindo 70%+
✅ Pronto para scale
```

---

**Documento:** Plano de Ação para Bugs  
**Atualizado:** 28/08/2026  
**Próxima revisão:** Após implementação de Prioridade 1

