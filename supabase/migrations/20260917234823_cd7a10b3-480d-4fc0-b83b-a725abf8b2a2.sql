-- ============================================================
-- 1) supabase_keep_alive: habilitar RLS e restringir acesso
-- ============================================================
ALTER TABLE public.supabase_keep_alive ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.supabase_keep_alive FROM anon;
REVOKE ALL ON public.supabase_keep_alive FROM authenticated;
GRANT ALL ON public.supabase_keep_alive TO service_role;
GRANT SELECT ON public.supabase_keep_alive TO authenticated;

DROP POLICY IF EXISTS keep_alive_admin_select ON public.supabase_keep_alive;
CREATE POLICY keep_alive_admin_select
  ON public.supabase_keep_alive
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin_master'
    )
  );

-- ============================================================
-- 2) View keep_alive_status: usar permissões de quem consulta
-- ============================================================
ALTER VIEW public.keep_alive_status SET (security_invoker = true);
REVOKE ALL ON public.keep_alive_status FROM anon;
GRANT SELECT ON public.keep_alive_status TO authenticated;
GRANT SELECT ON public.keep_alive_status TO service_role;

-- ============================================================
-- 3) blocks: criação restrita a gestores; agentes só campos operacionais
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_territory_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.has_role(_user_id, 'supervisor')
    OR public.has_role(_user_id, 'coordenador')
    OR public.has_role(_user_id, 'admin_master')
    OR public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id
        AND p.role IN ('supervisor', 'coordenador', 'admin_master')
        AND COALESCE(p.is_active, true)
    ), false)
$$;

REVOKE EXECUTE ON FUNCTION public.is_territory_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_territory_manager(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_territory_manager(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS blocks_insert ON public.blocks;
CREATE POLICY blocks_insert
  ON public.blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_territory_manager(auth.uid()));

DROP POLICY IF EXISTS blocks_update ON public.blocks;
CREATE POLICY blocks_update
  ON public.blocks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_territory_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_active, true)
    )
  )
  WITH CHECK (
    public.is_territory_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_active, true)
    )
  );

-- Restringe por coluna: agentes/usuários comuns só alteram campos operacionais
REVOKE UPDATE ON public.blocks FROM authenticated;
GRANT UPDATE (
  status,
  total_properties,
  latitude,
  longitude,
  address,
  neighborhood,
  city,
  locality,
  location_source,
  current_street,
  current_street_confirmed_at,
  current_street_confirmed_by
) ON public.blocks TO authenticated;

GRANT INSERT ON public.blocks TO authenticated; -- efetivo apenas para gestores (policy)
GRANT ALL ON public.blocks TO service_role;

-- ============================================================
-- 4) RPC segura para criação de quarteirão pelo fluxo do RG
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_block(_number text, _locality text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block_id uuid;
  v_subarea_id uuid;
  v_number text := btrim(_number);
  v_locality text := NULLIF(btrim(COALESCE(_locality, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND COALESCE(p.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Perfil inativo ou inexistente';
  END IF;

  IF v_number IS NULL OR v_number = '' THEN
    RAISE EXCEPTION 'Número do quarteirão obrigatório';
  END IF;

  SELECT b.id INTO v_block_id
  FROM public.blocks b
  WHERE b.number = v_number
    AND (
      v_locality IS NULL
      OR lower(btrim(COALESCE(b.locality, ''))) = lower(v_locality)
    )
  ORDER BY b.locality NULLS LAST
  LIMIT 1;

  IF v_block_id IS NOT NULL THEN
    RETURN v_block_id;
  END IF;

  SELECT s.id INTO v_subarea_id FROM public.subareas s LIMIT 1;
  IF v_subarea_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma subárea cadastrada para vincular o quarteirão';
  END IF;

  INSERT INTO public.blocks (number, locality, status, total_properties, subarea_id)
  VALUES (v_number, v_locality, 'not_started', 0, v_subarea_id)
  RETURNING id INTO v_block_id;

  RETURN v_block_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_block(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_block(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_block(text, text) TO authenticated, service_role;