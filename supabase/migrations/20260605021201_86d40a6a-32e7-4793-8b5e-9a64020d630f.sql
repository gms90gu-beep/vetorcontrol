
CREATE OR REPLACE FUNCTION public.cleanup_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  c integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_uid, 'admin_master'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: requer admin_master';
  END IF;

  DELETE FROM public.visit_deposits;    GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('visit_deposits', c);
  DELETE FROM public.visits;            GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('visits', c);
  DELETE FROM public.weekly_bulletins;  GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('weekly_bulletins', c);
  DELETE FROM public.daily_work_records;GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('daily_work_records', c);
  DELETE FROM public.field_work_sessions;GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('field_work_sessions', c);
  DELETE FROM public.rg_pdf_exports;    GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rg_pdf_exports', c);
  DELETE FROM public.rg_ocr_imports;    GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rg_ocr_imports', c);
  DELETE FROM public.rg_uploads;        GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('rg_uploads', c);
  DELETE FROM public.properties;        GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('properties', c);
  DELETE FROM public.boletins_rg;       GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('boletins_rg', c);
  DELETE FROM public.blocks;            GET DIAGNOSTICS c = ROW_COUNT; v_counts := v_counts || jsonb_build_object('blocks', c);

  INSERT INTO public.audit_log(action, entity, actor_id, metadata)
  VALUES ('cleanup_demo_data', 'system', v_uid, v_counts);

  RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_demo_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_demo_data() TO authenticated;
