CREATE OR REPLACE FUNCTION public.protect_last_active_master() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; removing boolean; remaining integer;
BEGIN
  PERFORM pg_advisory_xact_lock(73007160000);
  IF TG_TABLE_NAME = 'user_roles' THEN
    target := OLD.user_id;
    removing := OLD.role = 'admin_master' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin_master');
  ELSE
    target := OLD.id;
    removing := COALESCE(OLD.is_active, true) AND (TG_OP = 'DELETE' OR NEW.is_active = false);
  END IF;
  IF removing AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = target AND role = 'admin_master') THEN
    SELECT count(DISTINCT r.user_id) INTO remaining FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.role = 'admin_master' AND COALESCE(p.is_active, true) AND r.user_id <> target;
    IF remaining = 0 THEN RAISE EXCEPTION 'Não é possível remover ou desativar o último Admin Master ativo.' USING ERRCODE = '42501'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_last_master_profile BEFORE DELETE OR UPDATE OF is_active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_last_active_master();
CREATE TRIGGER protect_last_master_role BEFORE DELETE OR UPDATE OF role ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.protect_last_active_master();
CREATE OR REPLACE FUNCTION public.set_managed_user_role(p_user_id uuid, p_role public.app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(73007160000);
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, p_role) ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role <> p_role;
END $$;
REVOKE ALL ON FUNCTION public.set_managed_user_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_managed_user_role(uuid, public.app_role) TO service_role;
