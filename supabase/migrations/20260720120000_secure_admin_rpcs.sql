-- Corrige controle de acesso: funções administrativas (SECURITY DEFINER)
-- estavam liberadas para qualquer usuário autenticado (GRANT ... TO authenticated)
-- sem nenhuma checagem de cargo dentro da função. Isso significa que um agente
-- de campo comum, chamando supabase.rpc(...) diretamente (ex: pelo console do
-- navegador), conseguia executar rotinas administrativas — sincronizar status
-- de ciclos, criar registros de agente, reconciliar/excluir quarteirões de RG —
-- sem passar por nenhuma tela do admin_master.
--
-- Adiciona um helper reutilizável e passa a checar admin_master no início de
-- cada uma dessas funções, mantendo o restante da lógica idêntica.

CREATE OR REPLACE FUNCTION public.assert_admin_master()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: requer admin_master';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- sync_cycle_statuses
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_cycle_statuses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_finished int := 0;
  v_activated int := 0;
  r record;
BEGIN
  PERFORM public.assert_admin_master();

  UPDATE public.cycles SET status = 'finished'
   WHERE end_date < v_today AND status <> 'finished';
  GET DIAGNOSTICS v_finished = ROW_COUNT;

  FOR r IN
    SELECT DISTINCT ON (year) id, year FROM public.cycles
     WHERE v_today BETWEEN start_date AND end_date
     ORDER BY year, number
  LOOP
    UPDATE public.cycles SET status = 'not_started'
     WHERE year = r.year AND id <> r.id AND status = 'in_progress';
    UPDATE public.cycles SET status = 'in_progress'
     WHERE id = r.id AND status <> 'in_progress';
    IF FOUND THEN v_activated := v_activated + 1; END IF;
  END LOOP;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('sync_cycle_statuses', 'system', auth.uid(),
          jsonb_build_object('finished', v_finished, 'activated', v_activated, 'date', v_today));

  RETURN jsonb_build_object('finished', v_finished, 'activated', v_activated, 'date', v_today);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_cycle_statuses() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- agent_integrity_check
-- ─────────────────────────────────────────────────────────────
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
  PERFORM public.assert_admin_master();

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

GRANT EXECUTE ON FUNCTION public.agent_integrity_check(boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- data_audit_report
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.data_audit_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  today date := CURRENT_DATE;
BEGIN
  PERFORM public.assert_admin_master();

  -- RG (quarteirões)
  v := v || jsonb_build_object('rg', jsonb_build_object(
    'total_blocks', (SELECT count(*) FROM blocks),
    'blocks_with_properties', (SELECT count(DISTINCT block_id) FROM properties WHERE block_id IS NOT NULL),
    'blocks_without_properties', (SELECT count(*) FROM blocks b WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.block_id = b.id)),
    'duplicated_blocks', (SELECT count(*) FROM (SELECT number FROM blocks GROUP BY number HAVING count(*) > 1) x),
    'blocks_without_owner', (SELECT count(DISTINCT b.id) FROM blocks b LEFT JOIN boletins_rg br ON br.block_number = b.number WHERE br.agent_id IS NULL),
    'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'block', b.number,
        'agent', (SELECT p.full_name FROM boletins_rg br LEFT JOIN profiles p ON p.id = br.agent_id WHERE br.block_number = b.number LIMIT 1),
        'properties', (SELECT count(*) FROM properties pp WHERE pp.block_id = b.id),
        'status', b.status
      )), '[]'::jsonb) FROM (SELECT * FROM blocks ORDER BY created_at DESC LIMIT 25) b)
  ));

  -- Imóveis
  v := v || jsonb_build_object('properties', jsonb_build_object(
    'total', (SELECT count(*) FROM properties),
    'without_block', (SELECT count(*) FROM properties WHERE block_id IS NULL AND block_number IS NULL),
    'without_boletim', (SELECT count(*) FROM properties WHERE boletim_id IS NULL),
    'without_street', (SELECT count(*) FROM properties WHERE (street_name IS NULL OR street_name = '') AND street_id IS NULL),
    'without_number', (SELECT count(*) FROM properties WHERE number IS NULL OR number = ''),
    'without_user', (SELECT count(*) FROM properties WHERE user_id IS NULL),
    'duplicates', (SELECT count(*) FROM (
      SELECT block_number, number, street_name FROM properties
       WHERE block_number IS NOT NULL AND number IS NOT NULL
       GROUP BY block_number, number, street_name HAVING count(*) > 1) d)
  ));

  -- GPS
  v := v || jsonb_build_object('gps', jsonb_build_object(
    'total', (SELECT count(*) FROM properties),
    'geocoded', (SELECT count(*) FROM properties WHERE latitude IS NOT NULL AND longitude IS NOT NULL),
    'missing', (SELECT count(*) FROM properties WHERE latitude IS NULL OR longitude IS NULL),
    'invalid', (SELECT count(*) FROM properties
                 WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
                    OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))),
    'duplicated_coords', (SELECT count(*) FROM (
      SELECT latitude, longitude FROM properties
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       GROUP BY latitude, longitude HAVING count(*) > 1) d)
  ));

  -- Visitas
  v := v || jsonb_build_object('visits', jsonb_build_object(
    'total', (SELECT count(*) FROM visits),
    'without_property', (SELECT count(*) FROM visits WHERE property_id IS NULL),
    'without_agent', (SELECT count(*) FROM visits WHERE agent_id IS NULL),
    'without_date', (SELECT count(*) FROM visits WHERE visit_date IS NULL),
    'orphan', (SELECT count(*) FROM visits v LEFT JOIN properties p ON p.id = v.property_id WHERE p.id IS NULL),
    'without_cycle', (SELECT count(*) FROM visits WHERE cycle_id IS NULL)
  ));

  -- Focos
  v := v || jsonb_build_object('foci', jsonb_build_object(
    'positive_visits', (SELECT count(*) FROM visits WHERE has_focus = true),
    'deposits_total', (SELECT count(*) FROM visit_deposits),
    'positive_without_deposit', (SELECT count(*) FROM visits v WHERE v.has_focus = true AND NOT EXISTS (SELECT 1 FROM visit_deposits d WHERE d.visit_id = v.id)),
    'positive_deposit_without_visit', (SELECT count(*) FROM visit_deposits d LEFT JOIN visits v ON v.id = d.visit_id WHERE d.is_positive = true AND v.id IS NULL),
    'deposit_without_type', (SELECT count(*) FROM visit_deposits WHERE type_code IS NULL OR type_code = ''),
    'positive_visit_without_property', (SELECT count(*) FROM visits WHERE has_focus = true AND property_id IS NULL)
  ));

  -- Usuários
  v := v || jsonb_build_object('users', jsonb_build_object(
    'total', (SELECT count(*) FROM profiles),
    'inactive', (SELECT count(*) FROM profiles WHERE is_active = false),
    'agents_without_supervisor', (SELECT count(*) FROM profiles WHERE role = 'agente' AND supervisor_id IS NULL),
    'supervisors_without_team', (SELECT count(*) FROM profiles s WHERE s.role = 'supervisor' AND NOT EXISTS (SELECT 1 FROM profiles a WHERE a.supervisor_id = s.id)),
    'duplicated_emails', (SELECT count(*) FROM (SELECT email FROM profiles WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1) d),
    'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', full_name, 'role', role, 'supervisor', supervisor_id, 'active', is_active
    )), '[]'::jsonb) FROM (SELECT * FROM profiles ORDER BY created_at DESC LIMIT 25) p)
  ));

  -- Ciclos
  v := v || jsonb_build_object('cycles', jsonb_build_object(
    'by_date', (SELECT to_jsonb(c) FROM cycles c WHERE today BETWEEN start_date AND end_date ORDER BY year DESC, number LIMIT 1),
    'by_status', (SELECT to_jsonb(c) FROM cycles c WHERE status = 'in_progress' ORDER BY year DESC LIMIT 1),
    'multiple_in_progress', (SELECT count(*) > 1 FROM cycles WHERE status = 'in_progress'),
    'expired_in_progress', (SELECT count(*) FROM cycles WHERE status = 'in_progress' AND end_date < today)
  ));

  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.data_audit_report() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- reconcile_rg_integrity
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_rg_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocks_linked int := 0;
  v_blocks_created int := 0;
  v_properties_linked int := 0;
  v_orphans_removed int := 0;
  v_subarea uuid;
  r record;
  v_block_id uuid;
  v_loc text;
BEGIN
  PERFORM public.assert_admin_master();

  SELECT id INTO v_subarea FROM public.subareas LIMIT 1;

  FOR r IN
    SELECT id, block_number, locality, agent_id
      FROM public.boletins_rg
     WHERE block_id IS NULL AND block_number IS NOT NULL
  LOOP
    v_loc := COALESCE(NULLIF(trim(r.locality), ''), 'sem-localidade');

    SELECT id INTO v_block_id
      FROM public.blocks
     WHERE lower(trim(COALESCE(locality, 'sem-localidade'))) = lower(v_loc)
       AND number = r.block_number
     LIMIT 1;

    IF v_block_id IS NULL THEN
      INSERT INTO public.blocks (number, total_properties, status, subarea_id, locality)
      VALUES (r.block_number, 0, 'not_started'::public.block_status, v_subarea, v_loc)
      RETURNING id INTO v_block_id;
      v_blocks_created := v_blocks_created + 1;
    END IF;

    UPDATE public.boletins_rg SET block_id = v_block_id WHERE id = r.id;
    v_blocks_linked := v_blocks_linked + 1;
  END LOOP;

  WITH cand AS (
    SELECT p.id AS prop_id, b.id AS boletim_id
      FROM public.properties p
      JOIN public.boletins_rg b ON b.block_id = p.block_id
     WHERE p.boletim_id IS NULL
       AND p.block_id IS NOT NULL
       AND (b.agent_id IS NULL OR p.user_id IS NULL OR b.agent_id = p.user_id)
  ),
  uniq AS (
    SELECT prop_id, (array_agg(boletim_id))[1] AS boletim_id
      FROM cand
     GROUP BY prop_id
    HAVING count(DISTINCT boletim_id) = 1
  )
  UPDATE public.properties p
     SET boletim_id = u.boletim_id
    FROM uniq u
   WHERE p.id = u.prop_id;
  GET DIAGNOSTICS v_properties_linked = ROW_COUNT;

  WITH del AS (
    DELETE FROM public.blocks b
     WHERE NOT EXISTS (SELECT 1 FROM public.boletins_rg br WHERE br.block_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM public.properties pr WHERE pr.block_id = b.id)
       AND COALESCE(b.total_properties, 0) = 0
    RETURNING 1
  )
  SELECT count(*) INTO v_orphans_removed FROM del;

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('reconcile_rg_integrity', 'system', auth.uid(),
          jsonb_build_object(
            'blocks_linked', v_blocks_linked,
            'blocks_created', v_blocks_created,
            'properties_linked', v_properties_linked,
            'orphans_removed', v_orphans_removed
          ));

  RETURN jsonb_build_object(
    'blocks_linked', v_blocks_linked,
    'blocks_created', v_blocks_created,
    'properties_linked', v_properties_linked,
    'orphans_removed', v_orphans_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_rg_integrity() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- rg_integrity_check
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rg_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bol_no_block jsonb;
  v_prop_no_bol jsonb;
  v_prop_block_mismatch jsonb;
  v_dup_blocks jsonb;
  v_count_divergence jsonb;
  v_ok boolean;
BEGIN
  PERFORM public.assert_admin_master();

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'block_number', block_number, 'locality', locality)), '[]'::jsonb)
    INTO v_bol_no_block
    FROM public.boletins_rg WHERE block_id IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'block_id', block_id, 'block_number', block_number)), '[]'::jsonb)
    INTO v_prop_no_bol
    FROM public.properties WHERE boletim_id IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('property_id', p.id, 'boletim_id', p.boletim_id, 'prop_block_id', p.block_id, 'boletim_block_id', b.block_id)), '[]'::jsonb)
    INTO v_prop_block_mismatch
    FROM public.properties p
    JOIN public.boletins_rg b ON b.id = p.boletim_id
   WHERE p.block_id IS DISTINCT FROM b.block_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('number', number, 'locality', locality, 'count', cnt)), '[]'::jsonb)
    INTO v_dup_blocks
    FROM (
      SELECT number, COALESCE(locality, 'sem-localidade') AS locality, count(*) AS cnt
        FROM public.blocks
       GROUP BY number, COALESCE(locality, 'sem-localidade')
      HAVING count(*) > 1
    ) d;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'boletim_id', b.id, 'block_number', b.block_number,
           'card_count', (SELECT count(*) FROM public.properties pp WHERE pp.boletim_id = b.id),
           'detail_count', (SELECT count(*) FROM public.properties pd WHERE pd.boletim_id = b.id)
         )), '[]'::jsonb)
    INTO v_count_divergence
    FROM public.boletins_rg b
   WHERE (SELECT count(*) FROM public.properties pp WHERE pp.boletim_id = b.id)
      <> (SELECT count(*) FROM public.properties pd WHERE pd.boletim_id = b.id);

  v_ok := jsonb_array_length(v_bol_no_block) = 0
      AND jsonb_array_length(v_prop_block_mismatch) = 0
      AND jsonb_array_length(v_dup_blocks) = 0
      AND jsonb_array_length(v_count_divergence) = 0;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_ok THEN 'OK' ELSE 'FAIL' END,
    'boletins_sem_block', v_bol_no_block,
    'properties_sem_boletim', v_prop_no_bol,
    'properties_block_divergente', v_prop_block_mismatch,
    'blocks_duplicados', v_dup_blocks,
    'divergencia_card_detalhe', v_count_divergence
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rg_integrity_check() TO authenticated, service_role;
