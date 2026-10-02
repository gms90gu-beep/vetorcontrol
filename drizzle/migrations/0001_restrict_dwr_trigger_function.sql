REVOKE ALL ON FUNCTION public.rebuild_dwr_after_session_close() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_dwr_after_session_close() TO service_role;

COMMENT ON FUNCTION public.rebuild_dwr_after_session_close() IS
  'Trigger-only consolidation of daily_work_records when a session is closed, completed, or paused; direct client execution is restricted.';