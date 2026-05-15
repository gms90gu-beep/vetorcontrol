-- Revoke execute from public and authenticated to satisfy linter warnings
-- We will grant execute specifically to authenticated if needed, or rely on it being used within RLS as SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;

-- Note: The function can still be used in RLS policies by the table owner (postgres)
