-- 1) Vincular supervisores sem coordenador ao coordenador existente (quando houver apenas um)
UPDATE public.profiles p
SET coordinator_id = (SELECT c.id FROM public.profiles c WHERE c.role = 'coordenador' AND c.is_active LIMIT 1)
WHERE p.role = 'supervisor'
  AND p.coordinator_id IS NULL
  AND (SELECT count(*) FROM public.profiles c WHERE c.role = 'coordenador' AND c.is_active) = 1;

-- 2) Agentes sem supervisor: manter, mas garantir função de leitura para coordenador
CREATE OR REPLACE FUNCTION public.get_coordinator_data(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  supervisor_id uuid,
  coordinator_id uuid,
  is_active boolean,
  city text,
  registration_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só o próprio usuário autenticado pode consultar seus dados de escopo
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN;
  END IF;

  IF public.get_user_role(p_user_id) = 'admin_master' THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role::text, p.supervisor_id, p.coordinator_id, p.is_active, p.city, p.registration_number
    FROM public.profiles p;
    RETURN;
  END IF;

  IF public.get_user_role(p_user_id) = 'coordenador' THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role::text, p.supervisor_id, p.coordinator_id, p.is_active, p.city, p.registration_number
    FROM public.profiles p
    WHERE p.id = p_user_id
       OR (p.role = 'supervisor' AND (p.coordinator_id = p_user_id OR p.coordinator_id IS NULL))
       OR (
         p.role = 'agente'
         AND (
           p.supervisor_id IN (
             SELECT s.id FROM public.profiles s
             WHERE s.role = 'supervisor' AND (s.coordinator_id = p_user_id OR s.coordinator_id IS NULL)
           )
           OR p.supervisor_id IS NULL
         )
       );
    RETURN;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_coordinator_data(uuid) TO authenticated;