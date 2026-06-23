DROP POLICY IF EXISTS "Admin master can delete boletins" ON public.boletins_rg;

CREATE POLICY "Owner or supervisors can delete boletins"
ON public.boletins_rg
FOR DELETE
TO authenticated
USING (public.can_supervise_user(agent_id));