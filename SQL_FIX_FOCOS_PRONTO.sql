-- ============================================================================
-- 🔧 FIX AUTOMÁTICO: RLS Policy para Focos Aparecerem
-- ============================================================================
-- Cole TUDO isto no Supabase SQL Editor e execute (Ctrl+Enter)
-- Tempo: 5 segundos
-- Resultado: Supervisores verão focos! ✅
-- ============================================================================

-- PASSO 1: Deletar policies antigas que bloqueiam supervisores
DROP POLICY IF EXISTS "Agents can view their own visits" ON visits;
DROP POLICY IF EXISTS "Agentes veem apenas suas visitas" ON visits;
DROP POLICY IF EXISTS "Agents only" ON visits;
DROP POLICY IF EXISTS "Acesso baseado em role e equipe" ON visits;

-- PASSO 2: Criar policy CORRIGIDA
-- Permite:
-- • Agentes verem suas próprias visitas
-- • Supervisores/Coordenadores/Admins verem visitas de todos (ou seu time)
CREATE POLICY "Acesso baseado em role e equipe"
ON visits
FOR SELECT
USING (
  -- Agentes: veem apenas suas visitas
  auth.uid() = agent_id
  OR
  -- Supervisores/Coordenadores/Admins: veem visitas de todos os agentes
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('supervisor', 'coordenador', 'admin_master', 'admin_global')
  )
);

-- PASSO 3: Verificar que a policy foi criada com sucesso
SELECT policyname, permissive, roles
FROM pg_policies
WHERE tablename = 'visits'
ORDER BY policyname;

-- ============================================================================
-- FIM DO FIX
-- Se ver "Acesso baseado em role e equipe" no resultado → ✅ Sucesso!
-- Agora recarregue a página do app e supervisor verá focos!
-- ============================================================================
