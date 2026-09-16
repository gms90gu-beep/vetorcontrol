-- Garante que toda jornada encerrada consolide a produção do dia.
--
-- Motivo: existem caminhos de encerramento (inclusive offline/sincronização e
-- "Minhas Jornadas") que atualizam field_work_sessions para closed sem passar
-- pelo DailyWorkCloser. Como dashboards/relatórios leem daily_work_records,
-- visitas válidas podiam ficar invisíveis até uma reconstrução manual.
--
-- A consolidação é feita no banco, portanto também cobre encerramentos que
-- chegam posteriormente pela fila offline. rebuild_daily_work_records é
-- idempotente por (legacy_agent_id, work_date).

CREATE OR REPLACE FUNCTION public.rebuild_dwr_after_session_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Só consolida na transição efetiva para encerrada. INSERT já fechado também
  -- é aceito para cobrir sincronizações/replays offline.
  IF NEW.status::text = 'closed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    v_result := public.rebuild_daily_work_records(
      NEW.session_date,
      NEW.session_date,
      NEW.user_id
    );

    RAISE NOTICE '[DWR_AUTO_REBUILD_SESSION_CLOSE] session=% user=% date=% result=%',
      NEW.id, NEW.user_id, NEW.session_date, v_result;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- O encerramento da jornada não deve ser perdido por uma falha de
    -- consolidação. Registra o erro no log do Postgres; a reconstrução pode ser
    -- repetida com segurança depois.
    RAISE WARNING '[DWR_AUTO_REBUILD_FAILED] session=% user=% date=% error=%',
      NEW.id, NEW.user_id, NEW.session_date, SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rebuild_dwr_after_session_close
  ON public.field_work_sessions;

CREATE TRIGGER trg_rebuild_dwr_after_session_close
AFTER INSERT OR UPDATE OF status
ON public.field_work_sessions
FOR EACH ROW
EXECUTE FUNCTION public.rebuild_dwr_after_session_close();

COMMENT ON FUNCTION public.rebuild_dwr_after_session_close() IS
  'Consolida daily_work_records automaticamente quando uma jornada é encerrada, inclusive após sincronização offline.';