-- Preserva a produção real de 01/10/2026 no relatório diário.
--
-- A jornada foi usada para validar o lançamento futuro e ficou pausada antes
-- de registrar visitas. A reconstrução baseada somente em visits não cria uma
-- linha quando não há visita; isso fazia a jornada desaparecer dos relatórios.
-- Este ajuste cria apenas o registro-snapshot da sessão existente, sem inventar
-- imóveis, visitas ou indicadores e sem alterar o status da jornada.

DO $$
DECLARE
  v_session public.field_work_sessions%ROWTYPE;
  v_legacy_agent_id uuid;
  v_cycle_id uuid;
  v_week_id uuid;
BEGIN
  SELECT *
    INTO v_session
    FROM public.field_work_sessions
   WHERE id = 'ce55ea47-0443-4795-9baf-cf20f222d9ef'::uuid
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE '[DWR_REAL_PRODUCTION_20261001] sessão não encontrada; nada a fazer';
    RETURN;
  END IF;

  SELECT a.id
    INTO v_legacy_agent_id
    FROM public.agents a
   WHERE a.profile_id = v_session.user_id
   ORDER BY a.created_at
   LIMIT 1;

  IF v_legacy_agent_id IS NULL THEN
    RAISE WARNING '[DWR_REAL_PRODUCTION_20261001] agente legado não encontrado para profile=%', v_session.user_id;
    RETURN;
  END IF;

  v_cycle_id := v_session.cycle_id;
  v_week_id := v_session.week_id;

  IF v_cycle_id IS NULL OR v_week_id IS NULL THEN
    SELECT cycle_id, week_id
      INTO v_cycle_id, v_week_id
      FROM public.resolve_cycle_week(v_session.session_date);
  END IF;

  INSERT INTO public.daily_work_records (
    agent_id,
    legacy_agent_id,
    cycle_id,
    week_id,
    work_date,
    status,
    start_time,
    end_time,
    is_retroactive,
    properties_worked,
    properties_closed,
    properties_refused,
    properties_positive,
    blocks_worked,
    blocks_completed,
    pending_visits,
    data_integrity_log
  ) VALUES (
    v_session.user_id,
    v_legacy_agent_id,
    v_cycle_id,
    v_week_id,
    v_session.session_date,
    CASE WHEN v_session.status::text = 'closed' THEN 'completed' ELSE 'in_progress' END,
    COALESCE(v_session.started_at, v_session.created_at),
    NULL,
    COALESCE(v_session.is_retroactive, false),
    0,
    0,
    0,
    0,
    1,
    0,
    COALESCE(v_session.property_count, 0),
    jsonb_build_object(
      'rebuild', jsonb_build_object(
        'at', now(),
        'source', 'real_field_work_session_without_visits',
        'session_id', v_session.id,
        'note', 'produção real de validação futura preservada sem inventar visitas'
      )
    )
  )
  ON CONFLICT (agent_id, work_date) DO NOTHING;

  RAISE NOTICE '[DWR_REAL_PRODUCTION_20261001] sessão preservada id=% status=%',
    v_session.id, v_session.status;
END $$;

NOTIFY pgrst, 'reload schema';