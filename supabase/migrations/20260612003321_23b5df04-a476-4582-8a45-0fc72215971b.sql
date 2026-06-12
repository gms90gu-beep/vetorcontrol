
-- Backfill: cria agent para todo profile que não possui
INSERT INTO public.agents (profile_id, name, status)
SELECT p.id, COALESCE(NULLIF(p.full_name, ''), p.email, 'Agente'), 'active'
FROM public.profiles p
LEFT JOIN public.agents a ON a.profile_id = p.id
WHERE a.profile_id IS NULL
ON CONFLICT (profile_id) DO NOTHING;

-- Trigger: ao criar profile, criar agent automaticamente
CREATE OR REPLACE FUNCTION public.ensure_agent_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agents (profile_id, name, status)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.full_name, ''), NEW.email, 'Agente'), 'active')
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_agent_for_profile ON public.profiles;
CREATE TRIGGER trg_ensure_agent_for_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_agent_for_profile();

-- RPC: autoheal sob demanda (login / telas operacionais)
CREATE OR REPLACE FUNCTION public.autoheal_agent(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
  v_profile record;
BEGIN
  SELECT id INTO v_agent_id FROM public.agents WHERE profile_id = _user_id;
  IF v_agent_id IS NOT NULL THEN
    RETURN v_agent_id;
  END IF;

  SELECT id, full_name, email INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.agents (profile_id, name, status)
  VALUES (v_profile.id, COALESCE(NULLIF(v_profile.full_name, ''), v_profile.email, 'Agente'), 'active')
  ON CONFLICT (profile_id) DO NOTHING
  RETURNING id INTO v_agent_id;

  IF v_agent_id IS NULL THEN
    SELECT id INTO v_agent_id FROM public.agents WHERE profile_id = _user_id;
  END IF;

  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('autoheal_agent', 'agent', _user_id, v_agent_id, jsonb_build_object('created_at', now()));

  RETURN v_agent_id;
END;
$$;

-- RPC: health check (audit + correção em massa)
CREATE OR REPLACE FUNCTION public.agent_integrity_check(_fix boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_profiles int;
  v_total_agents int;
  v_missing int;
  v_created int := 0;
BEGIN
  SELECT count(*) INTO v_total_profiles FROM public.profiles;
  SELECT count(*) INTO v_total_agents FROM public.agents;
  SELECT count(*) INTO v_missing
    FROM public.profiles p LEFT JOIN public.agents a ON a.profile_id = p.id
    WHERE a.profile_id IS NULL;

  IF _fix AND v_missing > 0 THEN
    WITH ins AS (
      INSERT INTO public.agents (profile_id, name, status)
      SELECT p.id, COALESCE(NULLIF(p.full_name, ''), p.email, 'Agente'), 'active'
      FROM public.profiles p
      LEFT JOIN public.agents a ON a.profile_id = p.id
      WHERE a.profile_id IS NULL
      ON CONFLICT (profile_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_created FROM ins;

    INSERT INTO public.audit_log(action, entity, actor_id, metadata)
    VALUES ('agent_health_check', 'system', auth.uid(),
      jsonb_build_object('profiles_verificados', v_total_profiles, 'agents_criados', v_created, 'executed_at', now()));
  END IF;

  RETURN jsonb_build_object(
    'total_profiles', v_total_profiles,
    'total_agents', v_total_agents,
    'profiles_sem_agent', v_missing - v_created,
    'agents_criados', v_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.autoheal_agent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_integrity_check(boolean) TO authenticated;
