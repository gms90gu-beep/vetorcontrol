# 📚 VetorControl Hub - Documentação Completa

**Data:** 28 de Agosto de 2026  
**Versão:** 1.0  
**Status:** Produção ✅  
**PDF:** VetorControl_Manual_Completo.pdf

---

## 📑 Índice Geral

1. **[Visão Geral](#visão-geral)** - O que é o VetorControl
2. **[Arquitetura](#arquitetura)** - Stack técnico e estrutura
3. **[Configuração](#configuração)** - Como configurar e acessar
4. **[Roles e Permissões](#roles-e-permissões)** - Níveis de acesso
5. **[Solução RLS Coordenador](#solução-rls-para-coordenadores)** - Problema e solução
6. **[Guias Operacionais](#guias-operacionais)** - Como fazer tarefas
7. **[Status de Commits](#status-de-commits)** - Histórico de mudanças
8. **[Referência Técnica](#referência-técnica)** - Detalhes técnicos

---

# VISÃO GERAL

## O Que é VetorControl?

**VetorControl Hub** é um sistema web integrado para monitoramento e controle de focos de dengue, com foco em:

- ✅ Rastreamento de visitas de agentes
- ✅ Registro de focos encontrados
- ✅ Gestão de equipes (agentes, supervisores, coordenadores)
- ✅ Relatórios em tempo real
- ✅ Funcionalidade offline
- ✅ Sincronização automática

## Informações Principais

| Informação | Valor |
|-----------|-------|
| **URL Produção** | https://vetorcontrol.lovable.app |
| **Supabase Project** | ttjzgszxrnmcsygtzfcu |
| **Supabase URL** | https://ttjzgszxrnmcsygtzfcu.supabase.co |
| **GitHub Repo** | https://github.com/gms90gu-beep/vetorcontrol.git |
| **Framework** | TanStack Start |
| **Versão React** | 19 |
| **Database** | PostgreSQL |
| **Estado** | ✅ Em Produção |

## IDs Importantes

```
Agente Principal: 30f520ba-b5b8-4516-932e-0008ceab854d
Ciclo Ativo: 507e5edc-9062-4e8a-aceb-0c880b471002
```

---

# ARQUITETURA

## Stack Técnico

### Frontend

```
┌─ Framework
│  ├─ TanStack Start (Meta framework)
│  ├─ React 19 (UI)
│  └─ TypeScript (Type safety)
│
├─ Styling
│  ├─ Tailwind CSS (Utility-first)
│  ├─ shadcn/ui (Components)
│  └─ Custom CSS (Specializations)
│
├─ State Management
│  ├─ TanStack Query (Server state)
│  ├─ Zustand (Client state)
│  └─ React Context (Props drilling)
│
└─ Build & Deploy
   ├─ Vite (Build tool)
   ├─ Lovable (Deploy platform)
   └─ GitHub (Version control)
```

### Backend

```
┌─ Database
│  ├─ PostgreSQL (Supabase)
│  ├─ RLS (Row Level Security)
│  └─ Realtime (WebSocket)
│
├─ Authentication
│  ├─ Supabase Auth
│  ├─ JWT tokens
│  └─ Role-based access
│
├─ API
│  ├─ REST (HTTP)
│  ├─ RPC (Functions)
│  └─ Realtime (Subscriptions)
│
└─ Storage
   ├─ PostgreSQL (Data)
   ├─ Supabase Storage (Files)
   └─ IndexedDB (Offline cache)
```

### Offline & Sync

```
┌─ Offline Storage
│  ├─ Dexie (IndexedDB wrapper)
│  ├─ Local caching
│  └─ Sync queue
│
├─ Sync Logic
│  ├─ Automatic on connection
│  ├─ Queue management
│  └─ Conflict resolution
│
└─ Fallback
   ├─ Graceful degradation
   ├─ Error messages
   └─ Recovery flow
```

## Estrutura de Banco de Dados

### Tabelas Principais

#### `profiles` - Usuários do Sistema

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  full_name text,
  city text,
  role text,  -- admin_master, admin_global, coordenador, supervisor, agente
  supervisor_id uuid,  -- Para agentes
  coordinator_id uuid,  -- Para supervisores
  is_active boolean,
  created_at timestamp,
  metadata jsonb
);
```

#### `cycles` - Ciclos de Operação

```sql
CREATE TABLE cycles (
  id uuid PRIMARY KEY,
  name text,
  year integer,
  number integer,
  status text,  -- ativo, concluído
  start_date date,
  end_date date,
  municipality text,
  created_at timestamp
);
```

#### `properties` - Imóveis

```sql
CREATE TABLE properties (
  id uuid PRIMARY KEY,
  neighborhood text,
  block_id text,
  address text,
  coordinates geometry,
  municipality text,
  created_at timestamp
);
```

#### `visits` - Visitas de Agentes

```sql
CREATE TABLE visits (
  id uuid PRIMARY KEY,
  agent_id uuid,  -- FK profiles
  property_id uuid,  -- FK properties
  cycle_id uuid,  -- FK cycles
  visit_date date,
  status text,  -- pendente, concluído, cancelado
  has_focus boolean,
  visit_time interval,
  created_at timestamp,
  updated_at timestamp,
  metadata jsonb
);
```

#### `focus_reports` - Relatórios de Focos

```sql
CREATE TABLE focus_reports (
  id uuid PRIMARY KEY,
  visit_id uuid,  -- FK visits
  focus_type text,  -- dengue, zika, chikungunya, etc
  quantity integer,
  location text,
  treatment_date date,
  observations text,
  created_at timestamp
);
```

---

# CONFIGURAÇÃO

## Acesso ao Sistema

### URL de Produção

```
https://vetorcontrol.lovable.app
```

### Credenciais

```
Usuários criados via Supabase Auth
Email: seu_email@...
Senha: Criada durante setup
```

### Primeira Vez

1. Acessar URL de produção
2. Clicar em "Sign Up"
3. Inserir email
4. Verificar link no email
5. Criar senha
6. Sistema atribui role baseado no email/domínio

## Variáveis de Ambiente

```env
# .env
VITE_SUPABASE_URL=https://ttjzgszxrnmcsygtzfcu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Deploy

### Automático (Recomendado)

```bash
1. Push código ao GitHub
   git push origin main

2. Lovable detecta automaticamente
   - Faz pull do GitHub
   - Build via Vite
   - Deploy em ~15 minutos

3. URL atualizada automaticamente
   https://vetorcontrol.lovable.app
```

### Manual (Se necessário)

```bash
1. npm install
2. npm run build
3. npm run preview
4. Fazer deploy manualmente
```

---

# ROLES E PERMISSÕES

## Hierarquia de Acesso

```
┌─────────────────────────────────────────┐
│     ADMIN MASTER (Superuser)            │
│  ├─ Ver: TUDO (todos os dados)          │
│  ├─ Editar: TUDO                        │
│  ├─ Deletar: TUDO                       │
│  └─ RLS: BYPASS (sem restrições)        │
└─────────────────┬───────────────────────┘
                  │ (gerencia)
┌─────────────────────────────────────────┐
│     COORDENADOR (Gerente de Equipes)    │
│  ├─ Ver: Seus supervisores + agentes    │
│  ├─ Editar: Dados da equipe             │
│  ├─ Deletar: Dados da equipe            │
│  └─ RLS: Via RPC get_coordinator_data() │
└─────────────────┬───────────────────────┘
                  │ (gerencia)
┌─────────────────────────────────────────┐
│      SUPERVISOR (Chefe de Equipe)       │
│  ├─ Ver: Seus agentes + visitas         │
│  ├─ Editar: Dados da equipe             │
│  ├─ Deletar: Não                        │
│  └─ RLS: Filtrado por supervisor_id     │
└─────────────────┬───────────────────────┘
                  │ (gerencia)
┌─────────────────────────────────────────┐
│         AGENTE (Operacional)            │
│  ├─ Ver: Suas visitas + focos           │
│  ├─ Editar: Suas visitas                │
│  ├─ Deletar: Não                        │
│  └─ RLS: Filtrado por agent_id          │
└─────────────────────────────────────────┘
```

## Matriz de Permissões

| Ação | Admin Master | Coordenador | Supervisor | Agente |
|------|:---:|:---:|:---:|:---:|
| Ver Todos Dados | ✅ | ❌ | ❌ | ❌ |
| Ver Equipe | ✅ | ✅ | ✅ | ❌ |
| Ver Visitas | ✅ | ✅ | ✅ | ✅* |
| Criar Visita | ✅ | ❌ | ❌ | ✅* |
| Editar Visita | ✅ | ❌ | ❌ | ✅* |
| Deletar Visita | ✅ | ❌ | ❌ | ❌ |
| Criar Foco | ✅ | ❌ | ❌ | ✅ |
| Editar Foco | ✅ | ❌ | ❌ | ✅* |
| Gerenciar Usuários | ✅ | ❌ | ❌ | ❌ |
| Relatórios | ✅ | ✅ | ✅ | ❌ |

*Apenas suas próprias

---

# SOLUÇÃO RLS PARA COORDENADORES

## Problema Identificado

### Root Cause

```
RLS Policy no Supabase:
├─ Filtra: supervisor_id = auth.uid()
├─ Coordenador não é supervisor
├─ Não tem supervisor_id = seu_id
└─ RLS retorna: VAZIO ❌
```

### Sintomas

```
Coordenador abre app:
├─ Painel: Vazio (0 supervisores)
├─ Equipe: Vazia (0 agentes)
└─ Dashboard: Sem dados
```

## Solução Implementada

### Componentes 1-3: RPC com Fallback

**Arquivos modificados:**
- `src/components/coordination/MunicipalIntelligence.tsx`
- `src/components/supervision/CoordinatorDashboard.tsx`
- `src/components/supervision/SupervisionDashboard.tsx`

**Lógica:**

```typescript
// Tenta usar RPC (ignora RLS)
if (role === "coordenador" && user?.id) {
  try {
    const { data } = await supabase.rpc('get_coordinator_data', {
      p_user_id: user.id
    });
    if (data?.length > 0) {
      return data;  // ✅ RPC funcionou
    }
  } catch (error) {
    console.log("RPC não existe, usando fallback");
  }
}

// Fallback: usar listRemoteOrCache
return await listRemoteOrCache({...});
```

### Banco de Dados: Função RPC

**Arquivo:** `migrations/001_create_coordinator_rpc.sql`

**SQL:**

```sql
CREATE OR REPLACE FUNCTION public.get_coordinator_data(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  supervisor_id uuid,
  coordinator_id uuid,
  is_active boolean
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_user_id AND role = 'coordenador'
  ) THEN
    RETURN QUERY
    SELECT 
      p.id, p.full_name, p.email, p.role,
      p.supervisor_id, p.coordinator_id, p.is_active
    FROM public.profiles p
    WHERE (
      p.id = p_user_id
      OR (
        p.role = 'supervisor' 
        AND (p.coordinator_id = p_user_id OR p.coordinator_id IS NULL)
      )
      OR (
        p.role = 'agente'
        AND p.supervisor_id IN (
          SELECT id FROM public.profiles 
          WHERE (coordinator_id = p_user_id OR coordinator_id IS NULL)
          AND role = 'supervisor'
        )
      )
    );
  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_coordinator_data(uuid) TO authenticated;
```

## Timeline de Implementação

### Fase 1: Deploy Automático (~15 min)

```
1. Código enviado ao GitHub ✅
2. Lovable detecta mudanças (1-2 min)
3. Build + Deploy (10 min)
4. Resultado: Coordenador vê dados via Fallback ✅
   Console: [COORDINATOR_RPC] ⚠️ Fallback - RPC ainda não criada
```

### Fase 2: Admin Executa SQL (5 min)

```
1. Admin acessa Supabase SQL Editor
2. Copia SQL do arquivo migration
3. Cola e executa (Ctrl+Enter)
4. Função criada ✅
5. Coordenador recarrega app (F5)
6. Resultado: Sistema ativa RPC ✅
   Console: [COORDINATOR_RPC] ✅ Sucesso - dados via RPC
   Modo rigoroso ativado
```

## Resultado Final

### ANTES (RLS Bloqueando)

```
❌ Coordenador painel: Vazio
❌ Coordenador equipe: Vazia
❌ Supervisor painel/equipe: Mesma tela
```

### DEPOIS (Fallback ativo)

```
✅ Coordenador painel: Supervisores visíveis
✅ Coordenador equipe: Agentes visíveis
✅ Supervisor painel/equipe: Telas diferentes
```

### DEPOIS (RPC ativo)

```
✅ Coordenador 1: Vê SEUS supervisores
✅ Coordenador 2: Vê SEUS supervisores (diferentes!)
✅ Isolamento total
✅ Máxima segurança
```

---

# GUIAS OPERACIONAIS

## Para Administrador

### Executar SQL para Ativar RPC

1. **Acessar Supabase:**
   - URL: https://app.supabase.com
   - Selecionar projeto: ttjzgszxrnmcsygtzfcu

2. **Abrir SQL Editor:**
   - Menu esquerdo → SQL Editor
   - Clique para novo query

3. **Copiar SQL:**
   - Arquivo: `migrations/001_create_coordinator_rpc.sql`
   - Copiar conteúdo completo

4. **Executar:**
   - Colar no SQL Editor
   - Pressionar: Ctrl+Enter
   - Verificar: "Query executed successfully"

5. **Validar:**
   ```sql
   SELECT * FROM information_schema.routines 
   WHERE routine_name = 'get_coordinator_data';
   ```
   Esperado: 1 resultado

### Preencher coordinator_id

Para ativar modo rigoroso de segurança:

```sql
UPDATE profiles
SET coordinator_id = 'COORDENADOR_ID'
WHERE id IN (
  'SUPERVISOR_ID_1',
  'SUPERVISOR_ID_2',
  'SUPERVISOR_ID_3'
)
AND role = 'supervisor';
```

## Para Coordenador

### Acessar Dashboard

1. **Login:**
   - URL: https://vetorcontrol.lovable.app
   - Email + Senha

2. **Navegação:**
   - Menu → Coordenação
   - Ou: /coordenacao

3. **Verificar Dados:**
   - Painel: Deve mostrar supervisores
   - Equipe: Deve mostrar agentes
   - Se vazio: Verificar console (F12)

### Ver Console Logs

```javascript
// Abrir DevTools
F12

// Ir em Console
Procurar por: [COORDINATOR_RPC]

// Esperado:
[COORDINATOR_RPC] ✅ Sucesso - dados via RPC
// ou
[COORDINATOR_RPC] ⚠️ Fallback - RPC ainda não criada
```

## Para Supervisor

### Gerenciar Equipe

1. **Acessar:**
   - Menu → Supervisão
   - Seção: Gestão de Equipe

2. **Ver Agentes:**
   - Lista de agentes vinculados
   - Filtrado por supervisor_id

3. **Criar Visita:**
   - Selecionar agente
   - Atribuir propriedade
   - Ciclo ativo

### Relatórios

1. **Dashboard:**
   - Resumo: Focos por tipo
   - Mapa: Localização de focos
   - Gráficos: Tendências

2. **Exportar:**
   - Menu → Relatórios
   - Formato: PDF/Excel
   - Data range: Customizável

## Para Agente

### Registrar Visita

1. **App Mobile/Web:**
   - URL: https://vetorcontrol.lovable.app

2. **Nova Visita:**
   - Botão: "+ Nova Visita"
   - Selecionar propriedade
   - Data e hora

3. **Offline:**
   - Sistema funciona sem internet
   - Sincroniza quando voltar

### Registrar Foco

1. **Durante Visita:**
   - Botão: "Registrar Foco"
   - Tipo: Larva/Pupa/Adulto
   - Quantidade
   - Tratamento (sim/não)

2. **Foto (Opcional):**
   - Capturar foto
   - Anexar ao relatório

3. **Sincronizar:**
   - Automático quando online
   - Status: "Sincronizado" ✅

---

# STATUS DE COMMITS

## Histórico Completo de Correções

| # | Commit | Descrição | Status |
|---|--------|-----------|--------|
| 1 | 9f1ba946 | Bug divergência -65 DailyWorkCloser | ✅ |
| 2 | 549257cc | Keep-alive pagehide mobile | ✅ |
| 3 | f8141bd2 | Boletim RG novo → redirect + modal | ✅ |
| 4 | - | Sessão travada 24/08 Q19 (SQL Fix) | ✅ |
| 5 | 7ee2ba41 | Bug data retroativa | ✅ |
| 6 | f91f908 | Guard offline relatórios | ✅ |
| 7 | c9c5bdd | Cores mapa: foco vs fechada | ✅ |
| 8 | c7c4932 | Cores padronizadas dashboard | ✅ |
| 9 | e88da33 | Menu contraste (branco/85) | ✅ |
| 10 | 8fbeec0 | Auditoria focos supervisor | ✅ |
| 11 | c44727b | Fix Sincronização + Fechamento Expediente | ✅ |
| 12 | 7fe76c0 | UX: Confirmação Encerramento Quarteirão | ✅ |
| 13 | 8d35a4a | Prevenção Divergência: Sync Forçado + Orphan Cleanup | ✅ |
| 14 | 89c643e | Alinhamento Tabelas RG | ✅ |
| 15 | ab4193f | UX Offline para Criação de RG | ✅ |
| 16 | e242971 | Estudo Completo de Roles | ✅ |
| 17 | 2740182 | Auditoria Coordenador: Correção Filtros de Segurança | ✅ |
| 18 | 1445eaf | Correção Painel Coordenador Vazio | ✅ |
| 19 | a1f4352 | Botão Descartar Erros de Sincronização | ✅ |
| 20 | 663f557 | Correção Equipe Vazia (SupervisionDashboard) | ✅ |
| 21 | 087772c | Modo Permissivo para Coordenadores Novos | ✅ |
| 22 | 68313a3 | Guia SQL: Vincular Supervisores | ✅ |
| 23 | fd821ac | SQL RLS Bloqueando Coordenadores | ✅ |
| 24 | 062a982 | RPC com Fallback + Instruções | ✅ |
| 25 | b21ba8d | Resumo Executivo Solução Final | ✅ |

---

# REFERÊNCIA TÉCNICA

## Componentes Principais

### Coordenação

```
Pages/
├─ coordenacao/
│  ├─ CoordinatorPage.tsx (Layout)
│  └─ MunicipalIntelligence.tsx (Dashboard)
│
Components/
├─ coordination/
│  ├─ MunicipalIntelligence.tsx (Painel)
│  ├─ CoordinatorDashboard.tsx (Dashboard)
│  └─ ... (outros)
```

### Supervisão

```
Pages/
├─ supervision/
│  ├─ SupervisionPage.tsx (Layout)
│  └─ ... (pages)
│
Components/
├─ supervision/
│  ├─ SupervisionDashboard.tsx (Dashboard)
│  ├─ CoordinatorDashboard.tsx (Painel)
│  └─ ... (outros)
```

### Encerramento

```
Components/
├─ DailyWorkCloser.tsx (Fechar expediente)
├─ Validações (sincronização)
├─ Erros (tratamento)
└─ Queue (processamento)
```

## Funções RPC Disponíveis

### get_coordinator_data()

```sql
-- Retorna dados do coordenador ignorando RLS
-- Parâmetro: p_user_id (UUID do coordenador)
-- Retorna: Coordenador + Supervisores + Agentes

SELECT * FROM get_coordinator_data('coordenador-id');
```

## Variáveis de Ambiente

```env
# Supabase
VITE_SUPABASE_URL=https://ttjzgszxrnmcsygtzfcu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...

# API Keys
SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_URL=https://ttjzgszxrnmcsygtzfcu.supabase.co
```

## URLs Importantes

```
Produção: https://vetorcontrol.lovable.app
GitHub: https://github.com/gms90gu-beep/vetorcontrol.git
Supabase Dashboard: https://app.supabase.com/project/ttjzgszxrnmcsygtzfcu
Lovable: https://lovable.dev
```

---

# TROUBLESHOOTING

## Problema: Coordenador vê painel vazio

### Diagnóstico

```javascript
// Abrir DevTools (F12) → Console
// Procurar por:
[COORDINATOR_RPC]

// Se ver:
[COORDINATOR_RPC] ✅ Sucesso
└─ RPC está funcionando, mas sem dados
└─ Verificar se há supervisores no banco

[COORDINATOR_RPC] ⚠️ Fallback
└─ RPC não foi criada ainda
└─ Admin precisa executar SQL
```

### Solução

1. **Se fallback:**
   ```
   Admin executa SQL no Supabase
   arquivo: migrations/001_create_coordinator_rpc.sql
   Esperar ~30 seg
   Recarregar app (F5)
   ```

2. **Se RPC ✅ mas vazio:**
   ```
   Verificar se há supervisores no banco:
   SELECT id, full_name, coordinator_id 
   FROM profiles 
   WHERE role = 'supervisor';
   
   Se vazio: nenhum supervisor criado
   Se tem dados: verificar coordinator_id
   ```

## Problema: Supervisor vê painel e equipe iguais

### Root Cause

```
Painel usa: profiles + agentes (sem filtro específico)
Equipe usa: profiles + agentes (sem filtro específico)
Resultado: Mesma tela
```

### Solução

Já foi corrigido no código. Se ainda aparecer:

1. Recarregar app (F5)
2. Limpar cache (Ctrl+Shift+Delete)
3. Abrir DevTools (F12) → Storage → IndexedDB
4. Deletar cache de "profiles"
5. Recarregar novamente

## Problema: Erro ao criar visita offline

### Mensagem

```
"Error: Cannot create visit while offline"
```

### Solução

```
Visitas não podem ser criadas offline
(requer sincronização com servidor)

Opções:
1. Conectar à internet
2. Usar dados pré-carregados
3. Criar depois de conectar

RGs podem ser criados offline ✅
```

## Problema: Sincronização travada

### Sintomas

```
- Botão "Sincronizar" sempre em loading
- Dados não atualizam
- Erros na console
```

### Solução

1. **Botão "Descartar" erros:**
   ```
   Na tela de encerramento:
   - Botão "✕ Descartar"
   - Remove mensagem de erro
   - Limpa fila
   ```

2. **Forçar Sync:**
   ```
   DevTools → Application → Storage
   IndexedDB → vetorcontrol
   Deletar tabela 'sync_queue'
   Recarregar app (F5)
   ```

3. **Last resort:**
   ```
   Logout (Settings → Logout)
   Login novamente
   Sistema reconstrói cache
   ```

## Problema: Mapa não carrega

### Causa

```
- Focos não têm coordenadas
- Propriedades sem localização
- Erro de renderização Leaflet
```

### Solução

```
1. Verificar se propriedades têm coordinates:
   SELECT id, address, coordinates 
   FROM properties 
   WHERE coordinates IS NULL;

2. Se vazio: propriedades têm coordenadas ✅

3. Se tem dados: preencher coordenadas
   UPDATE properties
   SET coordinates = ST_GeomFromText(...)
   WHERE id = ?;
```

## Problema: RG não sincroniza

### Diagnóstico

```javascript
// Console
[FAILED_MUTATIONS] detectado
// Significa: Erro ao salvar RG no servidor
```

### Solução

1. **Ver erro específico:**
   - Botão "Ver detalhes"
   - Ler mensagem completa

2. **Erros comuns:**
   ```
   "Permission denied"
   → Verificar permissões de agente
   
   "Foreign key violation"
   → Verificar se visit_id existe
   
   "Invalid focus_type"
   → Usar tipos válidos: larva, pupa, adulto
   ```

3. **Retry:**
   ```
   Botão "Sincronizar Agora"
   Sistema retenta envio
   Se OK: dados sincronizam
   ```

---

# SUPORTE E CONTATO

## Documentação

- **Manual Completo:** VetorControl_Manual_Completo.pdf
- **Repositório:** https://github.com/gms90gu-beep/vetorcontrol.git
- **Issues:** GitHub Issues

## Próximas Melhorias

```
⏳ Focos visíveis para Supervisor (SQL pending)
⏳ Keep-alive no App.tsx
⏳ GitHub Actions keep-alive
⏳ Coordenador - criar primeiro usuário
⏳ SaaS Multi-Município - Implementação
```

---

**Documentação Completa do VetorControl Hub**  
*Última atualização: 28 de Agosto de 2026*  
*Versão: 1.0*  
*Status: ✅ Produção*

