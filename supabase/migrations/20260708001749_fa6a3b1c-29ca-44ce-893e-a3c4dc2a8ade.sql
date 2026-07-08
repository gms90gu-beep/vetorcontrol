REVOKE EXECUTE ON FUNCTION public.sync_property_block() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_property_block() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_property_block() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_property_block() TO service_role;