-- Fix 1: Revoke anon EXECUTE on SECURITY DEFINER trigger functions
REVOKE EXECUTE ON FUNCTION public.on_recovery_attempt_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.on_visit_create_recovery_attempt() FROM anon;

-- Fix 2: Remove tables from supabase_realtime publication to prevent unauthorized realtime access
ALTER PUBLICATION supabase_realtime DROP TABLE public.blocks;
ALTER PUBLICATION supabase_realtime DROP TABLE public.properties;
ALTER PUBLICATION supabase_realtime DROP TABLE public.visits;

-- Fix 3: Restrict visit_deposits SELECT policy to match visits visibility
DROP POLICY IF EXISTS "Deposits viewable by authenticated" ON public.visit_deposits;

CREATE POLICY "Deposits viewable by owner or supervisors" ON public.visit_deposits
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.visits
    WHERE visits.id = visit_deposits.visit_id
    AND can_supervise_user(visits.agent_id)
  )
);