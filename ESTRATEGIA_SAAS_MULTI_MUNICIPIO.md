# 🏢 TRANSFORMAÇÃO PARA SAAS MULTI-MUNICÍPIO

**Data:** 27/08/2026
**Status:** Análise Estratégica Completa
**Objetivo:** Converter VetorControl de single-tenant para multi-tenant SaaS

---

## 📋 QUESTÕES CRÍTICAS PRIMEIRO

Antes de desenhar a arquitetura, preciso saber:

### 1️⃣ **Quantos Municípios?**
```
□ 1-5 (começar com poucos)
□ 5-20 (crescimento médio)
□ 20+ (escala nacional)
```

### 2️⃣ **Isolamento de Dados**
```
□ Database Completamente Separado (máximo isolamento)
   └─ Cada município = Supabase project próprio
   └─ Mais caro, mais seguro, mais escalável

□ Schema Separado (médio isolamento)
   └─ 1 Banco, múltiplos schemas (um por município)
   └─ Mais barato, menos isolamento

□ Row-Level Security (mínimo isolamento)
   └─ 1 Banco, mesmas tabelas, filtro por tenant_id
   └─ Mais barato, compartilhado, risco de vazamento
```

### 3️⃣ **Modelo de Negócio**
```
□ Freemium (teste grátis, depois pago)
□ SaaS Pago (assinatura mensal)
□ Híbrido (alguns grátis, alguns pagos)
□ Interno (só para seus municípios)
```

### 4️⃣ **Timeline**
```
□ URGENTE (semanas)
□ Normal (1-2 meses)
□ Relaxado (3+ meses)
```

### 5️⃣ **Você faz tudo ou quer padrão?**
```
□ Quero máximo isolamento (cada município não vê nada de outro)
□ Quero máximo custo-benefício (compartilhar infraestrutura)
□ Meio termo
```

---

## 🏗️ ARQUITETURA RECOMENDADA (Meu voto)

```
┌─────────────────────────────────────────────────────────────┐
│ SAAS MULTI-TENANT: DATABASE-PER-TENANT (Máximo Isolamento) │
└─────────────────────────────────────────────────────────────┘

1. PORTAL CENTRAL (Cloud)
   └─ Gerir municípios, billing, domínios, sign-up
   └─ Database: PostgreSQL Central (um banco só)

2. INSTÂNCIA POR MUNICÍPIO (Cloud)
   └─ Cada município tem seu próprio Supabase project
   └─ Dados completamente isolados
   └─ Performance independente

3. AUTH GLOBAL
   └─ Autenticação única (SSO ou OAuth global)
   └─ Saber qual município o usuário pertence
   └─ Redirect automático para instância correta

4. APP (TanStack Start + React 19)
   └─ Detectar qual município está usando
   └─ Conectar ao Supabase correto
   └─ Restante do código IGUAL
```

---

## 🎯 ARQUITETURA EM DETALHES

### CAMADA 1: Portal Central (vetorcontrol.app)

```typescript
// Banco de dados CENTRAL (um só para tudo)
Database: PostgreSQL
Tabelas:
  ├─ organizations (municípios)
  │  ├─ id: UUID
  │  ├─ name: string (nome do município)
  │  ├─ domain: string (ou.vetorcontrol.app)
  │  ├─ custom_domain: string (opcional)
  │  ├─ supabase_project_id: string (qual projeto eles usam)
  │  ├─ supabase_key: string (chave pública)
  │  ├─ plan: enum (free, pro, enterprise)
  │  ├─ status: enum (active, suspended, inactive)
  │  ├─ created_at, updated_at
  │  └─ metadata: json (configs específicas)
  │
  ├─ organization_users
  │  ├─ id: UUID
  │  ├─ organization_id: FK
  │  ├─ auth_user_id: UUID (quem é)
  │  ├─ role: enum (owner, admin, user)
  │  └─ created_at
  │
  ├─ subscriptions (billing)
  │  ├─ id: UUID
  │  ├─ organization_id: FK
  │  ├─ plan: enum
  │  ├─ status: enum (active, canceled, past_due)
  │  ├─ current_period_start/end
  │  ├─ amount: decimal
  │  ├─ stripe_subscription_id: string
  │  └─ created_at, updated_at
  │
  └─ audit_log (opcional)
     ├─ organization_id
     ├─ action: string
     ├─ user_id
     └─ created_at
```

### CAMADA 2: Instâncias por Município

```
Cada município tem:
  ├─ Supabase Project Próprio
  │  └─ URL: municipio.supabase.co
  │  └─ Chave Pública: xxx
  │  └─ Database: Mesma estrutura que app atual
  │
  ├─ Schema Igual ao Atual
  │  ├─ profiles
  │  ├─ cycles
  │  ├─ weeks
  │  ├─ blocks
  │  ├─ properties
  │  ├─ visits
  │  ├─ visit_deposits
  │  ├─ property_pendencies
  │  ├─ field_work_sessions
  │  ├─ daily_work_records
  │  └─ ... resto
  │
  └─ RLS Policies (como agora, mas isolado)
     └─ Sem risco de vazar para outro município
```

### CAMADA 3: App (TanStack Start)

```typescript
// Detecta qual município está usando
function getCurrentOrganization() {
  // Opção 1: Por subdomain
  const subdomain = window.location.hostname.split('.')[0];
  // Se "curitiba.vetorcontrol.app" → subdomain = "curitiba"
  
  // Opção 2: Por query param
  // ?org=curitiba
  
  // Opção 3: Por custom domain
  // Se tem CNAME para curitiba.vetorcontrol.app
  
  return lookupOrganization(subdomain);
}

// Conecta ao Supabase correto
const organization = getCurrentOrganization();
const supabase = createClient(
  organization.supabase_url,
  organization.supabase_key
);

// Resto do app funciona IGUAL!
```

---

## 📊 COMPARAÇÃO: ABORDAGENS

### OPÇÃO 1: Database-per-Tenant (RECOMENDADO)

```
✅ VANTAGENS:
   • Máximo isolamento (cada município não vê nada)
   • Performance independente
   • Fácil backup/restore por município
   • Escalabilidade simples
   • Segurança máxima (sem RLS bugs vazando dados)

❌ DESVANTAGENS:
   • Mais caro (um Supabase por município)
   • Mais complexo de gerenciar
   • Precisa de portal central para orquestrar

💰 CUSTO:
   • Supabase Free: $0/mês
   • Supabase Pro: $25 x N municípios = caro

📊 MELHOR PARA:
   • Municípios que querem máxima segurança
   • Escala de 10+ municípios
   • Quem tem orçamento
```

### OPÇÃO 2: Schema-per-Tenant

```
✅ VANTAGENS:
   • Mais barato (1 banco só)
   • Isolamento razoável
   • Fácil implementar

❌ DESVANTAGENS:
   • Atenção: precisa adicionar tenant_id em TUDO
   • RLS policies mais complexas
   • Um problema de segurança = vazamento para todos

💰 CUSTO:
   • 1 Supabase: $25/mês

📊 MELHOR PARA:
   • Poucos municípios (1-5)
   • Orçamento apertado
   • Confiança total em RLS
```

### OPÇÃO 3: Row-Level Security (Não Recomendo)

```
✅ VANTAGENS:
   • Muito barato
   • 1 banco, mesmas tabelas
   
❌ DESVANTAGENS:
   • ⚠️ RISCO ALTO: um RLS policy errado = vazamento total
   • Difícil debugar problemas de segurança
   • Performance = todos usam mesma database
   • Muito complexo implementar

❌ QUANDO NÃO USAR:
   • Dados sensíveis de saúde pública
   • Municípios competidores
   • Conformidade legal rigorosa

💰 CUSTO:
   • 1 Supabase: $25/mês

📊 MELHOR PARA:
   • Prototipagem rápida
   • Equipes internas confiáveis
   • Dados não-sensíveis
```

---

## 🚀 PLANO DE IMPLEMENTAÇÃO (Database-per-Tenant)

### FASE 1: Portal Central (1-2 semanas)

```
1. Criar Nova App "VetorControl Admin"
   ├─ Autenticação global (NextAuth/Supabase Auth)
   ├─ Gestão de municípios (CRUD)
   ├─ Provisioning de Supabase projects
   ├─ Gestão de planos/billing
   └─ Dashboard de uso

2. Banco de Dados Central
   ├─ Create tables: organizations, subscriptions, users
   ├─ Set up RLS policies
   └─ Seed com primeiro município
```

### FASE 2: App Multi-Tenant (1-2 semanas)

```
1. Detectar Organização
   ├─ Por subdomain (curitiba.vetorcontrol.app)
   ├─ Lookup em banco central
   └─ Obter Supabase URL + key

2. Conectar ao Supabase Correto
   ├─ Create Supabase client dinâmico
   ├─ Usar Supabase da organização
   └─ Resto igual!

3. Validar Tenant
   ├─ User está em organization X?
   ├─ Tem permissão?
   └─ Block se não autorizado
```

### FASE 3: Provisioning Automático (1 semana)

```
1. Quando novo município sign-up:
   ├─ Criar Supabase project automaticamente
   ├─ Criar database com schema
   ├─ Popula primeiro admin user
   ├─ Gera chaves de API
   └─ Email confirmação

2. Orquestração
   ├─ Script em Node/Python que cria Supabase via API
   ├─ Ou manual (admin cria, assina chaves)
```

### FASE 4: Billing (1-2 semanas)

```
1. Stripe Integration
   ├─ Cada organização = customer do Stripe
   ├─ Plano selecionado = subscription
   ├─ Webhook para status changes

2. Limites por Plano
   ├─ Free: 1 agente, 1 ciclo
   ├─ Pro: 10 agentes, 4 ciclos, $50/mês
   ├─ Enterprise: ilimitado, $500/mês + custom
```

### FASE 5: Migração (1 semana)

```
1. Dados Atuais
   ├─ Município atual → seu próprio Supabase project
   ├─ Criar entry em organizations table
   └─ Testar acesso

2. Usuários Atuais
   ├─ Migrar para novo auth global
   ├─ Link a municipality
   └─ Manter senhas/tokens
```

---

## 🎯 ESTRUTURA DE CÓDIGO

### Nova Estrutura de Pastas

```
vetorcontrol/
├─ apps/
│  ├─ admin/ (Portal de Gestão)
│  │  ├─ src/
│  │  │  ├─ routes/ (gerenciar municípios)
│  │  │  ├─ components/ (dashboard admin)
│  │  │  ├─ lib/
│  │  │  │  └─ supabase-admin.ts (acesso ao banco central)
│  │  │  └─ integrations/
│  │  │     └─ stripe.ts (billing)
│  │  └─ package.json
│  │
│  └─ app/ (VetorControl Principal)
│     ├─ src/
│     │  ├─ routes/ (mesmo de antes)
│     │  ├─ components/ (mesmo de antes)
│     │  ├─ lib/
│     │  │  ├─ organization.ts (detecta qual é)
│     │  │  ├─ supabase-dynamic.ts (conecta ao correto)
│     │  │  └─ auth-global.ts (auth central)
│     │  └─ middleware/ (valida tenant)
│     └─ package.json
│
├─ packages/
│  ├─ shared-types/ (tipos compartilhados)
│  │  └─ organization.ts, subscription.ts, etc
│  │
│  └─ supabase-schema/
│     ├─ schema.sql (estrutura que cada município tem)
│     ├─ migrations/
│     └─ seed.sql (dados iniciais)
│
└─ infra/
   ├─ supabase-provisioning.ts (criar novo projeto)
   ├─ stripe-setup.ts (integração billing)
   └─ docker-compose.yml (banco central local)
```

---

## 💰 CUSTO ESTIMADO (Mensal)

### OPÇÃO 1: Database-per-Tenant

```
Com 5 municípios:
  • Supabase Pro x5: $25 x 5 = $125
  • Banco Central: $25
  • Servidor Portal: $20 (ou grátis se Vercel)
  • Stripe: 2.9% + $0.30 por transação
  ────────────────────────────────────
  Total: ~$170/mês + percentual das vendas

Com 20 municípios:
  • $25 x 20 = $500
  • + $25 (central)
  • + $20 (portal)
  ────────────────────────────────────
  Total: ~$545/mês + billing
```

### OPÇÃO 2: Schema-per-Tenant

```
Com qualquer # de municípios:
  • Supabase Pro: $25
  • Servidor Portal: $20
  • Stripe: 2.9% + $0.30
  ────────────────────────────────────
  Total: ~$45/mês + percentual das vendas

(Muito mais barato!)
```

---

## 🎁 O QUE PRECISA FAZER

```
1. ✅ Responder as 5 questões acima
2. ✅ Escolher abordagem (Database-per-tenant? Schema? RLS?)
3. ✅ Definir timeline
4. ✅ Orçamento disponível?

Depois:
5. Desenho detalha do banco (schema.sql)
6. Migração de dados (scripts)
7. Implementar portal central
8. Implementar app multi-tenant
9. Provisioning automático
10. Testes de segurança/isolamento
```

---

## 🔐 SEGURANÇA CRÍTICA

```
AUTENTICAÇÃO:
  ✅ Cada município tem suas próprias credenciais Supabase
  ✅ RLS policies isolam usuários por município
  ✅ Nenhum cross-tenant access

DADOS:
  ✅ Database completamente separado
  ✅ Backup por município
  ✅ Sem risco de "um município vê dados de outro"

COMPLIANCE:
  ✅ LGPD: dados brasileiros em servidores brasileiros (Supabase RJ)
  ✅ Auditoria: cada ação logada com tenant
  ✅ Direito ao esquecimento: delete é isolado por tenant
```

---

## 📞 PRÓXIMO PASSO

**Me responde as 5 questões acima e eu desenho:**

1. Arquitetura SQL completa (schema)
2. Código de exemplo (App multi-tenant)
3. Scripts de provisioning
4. Plano de migração
5. Implementação passo-a-passo

**Qual abordagem você prefere?**

A. **Database-per-Tenant** (máximo isolamento, mais caro)
B. **Schema-per-Tenant** (meio termo, barato)
C. **Row-Level Security** (muito barato, risco)

👇 **Responde e começamos!**
