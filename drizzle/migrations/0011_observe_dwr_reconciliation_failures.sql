-- 20261008170000_observe_dwr_reconciliation_failures.sql
-- Observability only: no historical rows are updated or rebuilt by this migration.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.rebuild_daily_work_records(date,date,uuid)'::regprocedure) INTO definition;
  definition := replace(definition, E'END;\n$function$', $replacement$EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
  VALUES ('dwr_reconciliation_failed', 'daily_work_records', auth.uid(), _agent,
    jsonb_build_object('from', _from, 'to', _to, 'agent_id', _agent,
      'sqlstate', SQLSTATE, 'error', SQLERRM, 'source', 'rebuild_daily_work_records'));
  RETURN jsonb_build_object('failed', true, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$$replacement$);
  EXECUTE definition;
  SELECT pg_get_functiondef('public.rebuild_dwr_after_session_close()'::regprocedure) INTO definition;
  definition := replace(definition, $needle$    RAISE WARNING '[DWR_AUTO_REBUILD_FAILED]$needle$, $replacement$    BEGIN
      INSERT INTO public.audit_log(action, entity, actor_id, target_id, metadata)
      VALUES ('dwr_reconciliation_failed', 'field_work_sessions', NEW.user_id, NEW.id,
        jsonb_build_object('session_id', NEW.id, 'agent_id', NEW.user_id,
          'work_date', NEW.session_date, 'status', NEW.status,
          'sqlstate', SQLSTATE, 'error', SQLERRM, 'source', 'rebuild_dwr_after_session_close'));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[DWR_AUDIT_FAILED] session=% error=%', NEW.id, SQLERRM;
    END;
    RAISE WARNING '[DWR_AUTO_REBUILD_FAILED]$replacement$);
  EXECUTE definition;
END;
$migration$;
REVOKE ALL ON FUNCTION public.rebuild_daily_work_records(date,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_daily_work_records(date,date,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rebuild_dwr_after_session_close() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_dwr_after_session_close() TO service_role;
