
-- 1) Corrigir Gustavo
UPDATE public.profiles
SET supervisor_id = '26655451-27cd-4abe-a019-42fe1be2fbb3'
WHERE id = '30f520ba-b5b8-4516-932e-0008ceab854d'
  AND supervisor_id IS NULL;

-- 2) Trigger de validação: agente precisa de supervisor_id
CREATE OR REPLACE FUNCTION public.enforce_agent_supervisor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'agente'::user_role_type AND NEW.supervisor_id IS NULL THEN
    RAISE EXCEPTION 'Agente % deve possuir supervisor_id obrigatoriamente.', COALESCE(NEW.full_name, NEW.email, NEW.id::text)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_agent_supervisor ON public.profiles;
CREATE TRIGGER trg_enforce_agent_supervisor
BEFORE INSERT OR UPDATE OF role, supervisor_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_supervisor();
