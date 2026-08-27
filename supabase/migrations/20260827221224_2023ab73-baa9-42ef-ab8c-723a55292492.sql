CREATE OR REPLACE FUNCTION public.enforce_agent_supervisor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Na criação da conta o perfil é inserido pelo trigger handle_new_user com
  -- role 'agente' e supervisor_id NULL (o vínculo é definido logo depois pelo
  -- fluxo de cadastro). Exigir supervisor já no INSERT quebrava a criação de
  -- QUALQUER usuário novo, inclusive coordenadores.
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'agente'::user_role_type AND NEW.supervisor_id IS NULL THEN
    RAISE EXCEPTION 'Agente % deve possuir supervisor_id obrigatoriamente.', COALESCE(NEW.full_name, NEW.email, NEW.id::text)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;