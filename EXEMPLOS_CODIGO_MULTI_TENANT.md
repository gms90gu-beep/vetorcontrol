# 🔧 EXEMPLOS DE CÓDIGO: 3 Abordagens Multi-Tenant

---

## ABORDAGEM 1: Database-per-Tenant (RECOMENDADO)

### 1.1 Detectar Organização (dinamico.ts)

```typescript
// src/lib/organization.ts

import type { Organization } from "@shared-types/organization";
import { supabase as centralDb } from "@/integrations/supabase/client";

// Cache para não consultar todo request
let cachedOrg: Organization | null = null;
let cachedOrgId: string | null = null;

export async function getCurrentOrganization(): Promise<Organization> {
  // Já cacheia?
  if (cachedOrgId === window.location.hostname && cachedOrg) {
    return cachedOrg;
  }

  // Detectar por subdomain
  const hostname = window.location.hostname;
  // curitiba.vetorcontrol.app → subdomain = "curitiba"
  const subdomain = hostname.split(".")[0];

  // Ou query param
  const params = new URLSearchParams(window.location.search);
  const orgFromUrl = params.get("org");

  const identifier = orgFromUrl || subdomain;

  // Consultar banco CENTRAL
  const { data, error } = await centralDb
    .from("organizations")
    .select("*")
    .or(`subdomain.eq.${identifier},custom_domain.eq.${identifier}`)
    .single();

  if (error || !data) {
    throw new Error(`Organização não encontrada: ${identifier}`);
  }

  cachedOrg = data as Organization;
  cachedOrgId = hostname;
  return data as Organization;
}

export function getOrganizationSync(): Organization | null {
  return cachedOrg;
}

// Precarrega organização no boot
export async function initializeOrganization() {
  try {
    cachedOrg = await getCurrentOrganization();
    console.log(`[ORG] Inicializada: ${cachedOrg.name}`);
  } catch (e) {
    console.error("[ORG] Erro ao inicializar:", e);
    throw e;
  }
}
```

### 1.2 Cliente Supabase Dinâmico (supabase-dynamic.ts)

```typescript
// src/integrations/supabase/supabase-dynamic.ts

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getCurrentOrganization } from "@/lib/organization";

let dynamicSupabase: ReturnType<typeof createClient<Database>> | null = null;
let lastOrgId: string | null = null;

export async function getSupabaseClient() {
  // Se já tem client inicializado e organização não mudou
  if (dynamicSupabase && lastOrgId) {
    return dynamicSupabase;
  }

  const org = await getCurrentOrganization();

  // Mudou de organização? Recria client
  if (lastOrgId !== org.id) {
    dynamicSupabase = createClient<Database>(
      org.supabase_url,
      org.supabase_anon_key
    );
    lastOrgId = org.id;
    console.log(`[SUPABASE] Conectado a ${org.name}`);
  }

  return dynamicSupabase;
}

// Exportar como padrão
export const supabase = getSupabaseClient();
```

### 1.3 Banco Central (schema.sql)

```sql
-- Banco CENTRAL (vetorcontrol.app)
-- Gerencia todas as organizações e billing

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação
  name TEXT NOT NULL UNIQUE, -- "Prefeitura de Curitiba"
  subdomain TEXT NOT NULL UNIQUE, -- "curitiba"
  custom_domain TEXT UNIQUE, -- "meu-app.com.br"
  
  -- Supabase
  supabase_project_id TEXT NOT NULL UNIQUE,
  supabase_url TEXT NOT NULL,
  supabase_anon_key TEXT NOT NULL,
  supabase_admin_key TEXT NOT NULL ENCRYPTED,
  
  -- Plano
  plan TEXT CHECK (plan IN ('free', 'pro', 'enterprise')),
  status TEXT CHECK (status IN ('active', 'suspended', 'inactive')),
  
  -- Limites
  max_agents INT DEFAULT 5,
  max_cycles INT DEFAULT 1,
  max_properties INT DEFAULT 1000,
  
  -- Admin
  owner_email TEXT NOT NULL,
  admin_id UUID,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  suspended_at TIMESTAMP
);

CREATE TABLE organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('owner', 'admin', 'supervisor', 'user')),
  
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(organization_id, auth_user_id)
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Stripe
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_product_id TEXT,
  
  plan TEXT CHECK (plan IN ('free', 'pro', 'enterprise')),
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'BRL',
  interval TEXT DEFAULT 'month',
  
  status TEXT CHECK (status IN ('active', 'inactive', 'past_due', 'canceled')),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  changes JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT now()
);

-- Índices
CREATE INDEX idx_organizations_subdomain ON organizations(subdomain);
CREATE INDEX idx_organizations_custom_domain ON organizations(custom_domain);
CREATE INDEX idx_organization_users_org ON organization_users(organization_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

### 1.4 Schema por Município (schema-municipio.sql)

```sql
-- Cada município tem este schema
-- (mesmo schema que app atual)

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'agente',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INT NOT NULL,
  number INT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES cycles(id),
  number INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- ... resto igual ao app atual

-- RLS (cada organização só vê seus dados)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem todos de sua org"
ON profiles
FOR SELECT
TO authenticated
USING (true); -- Já isolado por ser database separado
```

### 1.5 Provisioning Automático (provision.ts)

```typescript
// infra/provision.ts

import { SupabaseManagementAPI } from "@supabase/admin-api-client";

const adminClient = new SupabaseManagementAPI({
  apiKey: process.env.SUPABASE_ADMIN_API_KEY,
});

export async function provisionNewOrganization(
  name: string,
  subdomain: string,
  ownerEmail: string
) {
  console.log(`[PROVISION] Criando organização: ${name}`);

  // 1. Criar Supabase Project
  const project = await adminClient.projects.create({
    name: `VetorControl - ${name}`,
    region: "south-america-east-1", // Rio de Janeiro
  });

  console.log(`[PROVISION] Supabase criado: ${project.id}`);

  // 2. Obter chaves
  const keys = await adminClient.projects.getAPIKeys(project.id);
  const anonKey = keys.find((k) => k.name === "service_role")?.api_key;

  // 3. Criar database e schema
  const supabase = new SupabaseClient(
    `https://${project.id}.supabase.co`,
    anonKey!
  );

  // Rodar migrations
  await runMigrations(supabase, SCHEMA_SQL);

  // 4. Registrar em banco central
  const { data: org, error } = await centralDb
    .from("organizations")
    .insert({
      name,
      subdomain,
      custom_domain: null,
      supabase_project_id: project.id,
      supabase_url: `https://${project.id}.supabase.co`,
      supabase_anon_key: anonKey,
      supabase_admin_key: keys.find((k) => k.name === "service_role")?.api_key,
      plan: "free",
      owner_email: ownerEmail,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`[PROVISION] ✅ Organização criada: ${org.id}`);

  return org;
}
```

---

## ABORDAGEM 2: Schema-per-Tenant

### 2.1 Detectar Tenant (tenant-context.ts)

```typescript
// src/lib/tenant-context.ts

let currentTenantId: string | null = null;

export function setCurrentTenant(tenantId: string) {
  currentTenantId = tenantId;
}

export function getCurrentTenant(): string {
  if (!currentTenantId) {
    throw new Error("Tenant não foi inicializado");
  }
  return currentTenantId;
}

export async function initializeTenant() {
  // Detectar por subdomain ou query param
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0];
  const params = new URLSearchParams(window.location.search);
  const tenantFromUrl = params.get("tenant");

  const identifier = tenantFromUrl || subdomain;

  // Consultar qual é o tenant_id
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("subdomain", identifier)
    .single();

  if (data) {
    setCurrentTenant(data.id);
  }
}
```

### 2.2 Cliente Supabase com Tenant Filter (supabase-tenant.ts)

```typescript
// src/integrations/supabase/supabase-tenant.ts

import { createClient } from "@supabase/supabase-js";
import { getCurrentTenant } from "@/lib/tenant-context";

export const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// Wrapper que adiciona filtro tenant_id automaticamente
export class TenantAwareSupabase {
  constructor(private baseClient: typeof supabase) {}

  from(table: string) {
    const tenantId = getCurrentTenant();

    // Tabelas que têm tenant_id
    const tenantTables = [
      "profiles",
      "cycles",
      "blocks",
      "properties",
      "visits",
      // ...
    ];

    if (tenantTables.includes(table)) {
      return this.baseClient
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId); // Filtro automático!
    }

    return this.baseClient.from(table);
  }
}

export const tenantSupabase = new TenantAwareSupabase(supabase);
```

### 2.3 Schema Compartilhado com tenant_id

```sql
-- Uma só database, múltiplos tenants

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subdomain TEXT NOT NULL UNIQUE,
  custom_domain TEXT UNIQUE,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);

-- Todas as tabelas TÊM tenant_id!
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(tenant_id, id)
);

CREATE TABLE cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  year INT,
  number INT,
  created_at TIMESTAMP DEFAULT now()
);

-- RLS: filtrar por tenant_id
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê apenas seu tenant"
ON profiles
FOR SELECT
TO authenticated
USING (
  tenant_id = (
    SELECT tenant_id FROM organization_users 
    WHERE auth_user_id = auth.uid()
  )
);

-- Índices!
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_cycles_tenant ON cycles(tenant_id);
```

---

## ABORDAGEM 3: Row-Level Security (Não Recomendo)

### 3.1 Schema com RLS Apenas

```sql
-- Same database, same tables, filter by auth.jwt()

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Evitar que veja tenants de outros
CREATE POLICY "Usuário vê apenas seu tenant"
ON tenants
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.tenant_id = tenants.id
    AND p.id = auth.uid()
  )
);

-- Evitar que veja profiles de outros tenants
CREATE POLICY "Vê profiles do seu tenant"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    WHERE t.id = profiles.tenant_id
    AND (
      t.owner_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM profiles me
        WHERE me.id = auth.uid()
        AND me.tenant_id = t.id
      )
    )
  )
);
```

⚠️ **PROBLEMA:** Um bug aqui e um tenant vê dados de outro!

---

## 🎯 COMPARAÇÃO RÁPIDA

| Aspecto | Database-per | Schema-per | RLS |
|---------|-------------|-----------|-----|
| **Isolamento** | ✅✅✅ | ✅✅ | ✅ |
| **Segurança** | Máxima | Boa | Risco |
| **Custo** | Alto | Baixo | Muito Baixo |
| **Complexidade** | Média | Média | Alta (bugs RLS) |
| **Performance** | Independente | Compartilhada | Compartilhada |
| **Escalabilidade** | Ótima | Boa | Limitada |

---

## 🚀 QUAL ESCOLHER?

```
SE você tem:
  • Budget ($$$)
  • Poucos municípios (1-10)
  • Dados sensíveis
  → Use DATABASE-PER-TENANT ✅

SE você tem:
  • Budget limitado ($)
  • Muitos municípios (20+)
  • Dados menos sensíveis
  → Use SCHEMA-PER-TENANT ✅

SE você quer:
  • Máximo barato ($0 extra)
  • Prototipagem rápida
  • Confia totalmente em RLS
  → Use ROW-LEVEL SECURITY (⚠️ cuidado!)
```

---

**Qual você escolhe?** Depois implementa tudo! 🚀
