-- Remove public and anonymous access to SECURITY DEFINER functions that should not be callable without authentication
REVOKE EXECUTE ON FUNCTION public.cleanup_demo_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_demo_data() FROM anon;

-- Remove public access to trigger functions; authenticated access remains intact
REVOKE EXECUTE ON FUNCTION public.on_recovery_attempt_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_visit_create_recovery_attempt() FROM PUBLIC;