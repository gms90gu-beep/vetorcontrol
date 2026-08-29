-- Função RPC para coordenadores acessarem dados ignorando RLS
-- Cria função que retorna supervisores e agentes do coordenador
-- Ignora RLS porque usa SECURITY DEFINER

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
  -- Verificar se o usuário é coordenador
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_user_id AND role = 'coordenador'
  ) THEN
    -- Retornar: coordenador + supervisores dele + agentes dos supervisores dele
    RETURN QUERY
    SELECT 
      p.id,
      p.full_name,
      p.email,
      p.role,
      p.supervisor_id,
      p.coordinator_id,
      p.is_active
    FROM public.profiles p
    WHERE (
      -- Próprio coordenador
      p.id = p_user_id
      OR (
        -- Supervisores vinculados (com coordinator_id) OU supervisores legados (NULL)
        p.role = 'supervisor' 
        AND (
          p.coordinator_id = p_user_id 
          OR p.coordinator_id IS NULL
        )
      )
      OR (
        -- Agentes dos supervisores acima
        p.role = 'agente'
        AND p.supervisor_id IN (
          SELECT id FROM public.profiles 
          WHERE (coordinator_id = p_user_id OR coordinator_id IS NULL)
          AND role = 'supervisor'
        )
      )
    );
  ELSE
    -- Se não é coordenador: retorna vazio (segurança)
    RETURN;
  END IF;
END;
$$;

-- Grant permissão para usuários autenticados chamarem a função
GRANT EXECUTE ON FUNCTION public.get_coordinator_data(uuid) TO authenticated;
