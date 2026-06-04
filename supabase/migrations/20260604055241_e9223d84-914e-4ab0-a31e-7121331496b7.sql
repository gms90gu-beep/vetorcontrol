DROP POLICY IF EXISTS "Users can insert their own properties" ON public.properties;
DROP POLICY IF EXISTS "Users can update their own properties" ON public.properties;
DROP POLICY IF EXISTS "Users can delete their own properties" ON public.properties;

CREATE POLICY "Users and supervisors can insert linked properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id IS NOT NULL
  AND public.can_supervise_user(user_id)
);

CREATE POLICY "Users and supervisors can update linked properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    (user_id IS NOT NULL AND public.can_supervise_user(user_id))
    OR EXISTS (
      SELECT 1
      FROM public.boletins_rg b
      WHERE b.id = properties.boletim_id
        AND public.can_supervise_user(b.agent_id)
    )
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    (user_id IS NOT NULL AND public.can_supervise_user(user_id))
    OR EXISTS (
      SELECT 1
      FROM public.boletins_rg b
      WHERE b.id = properties.boletim_id
        AND public.can_supervise_user(b.agent_id)
    )
  )
);

CREATE POLICY "Users and supervisors can delete linked properties"
ON public.properties
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    (user_id IS NOT NULL AND public.can_supervise_user(user_id))
    OR EXISTS (
      SELECT 1
      FROM public.boletins_rg b
      WHERE b.id = properties.boletim_id
        AND public.can_supervise_user(b.agent_id)
    )
  )
);