DROP POLICY IF EXISTS "Admin Master can manage all profiles" ON public.profiles;

CREATE POLICY "Admin master can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin_master'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));