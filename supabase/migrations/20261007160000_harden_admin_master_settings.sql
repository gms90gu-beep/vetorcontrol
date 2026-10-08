-- Admin Master audit: system settings are not operational data for agents.
-- Keep the table available to the server and Admin Master only; do not expose
-- configuration values to every authenticated user.

DROP POLICY IF EXISTS "System settings are viewable by all authenticated users" ON public.system_settings;
DROP POLICY IF EXISTS "System settings can be updated by managers" ON public.system_settings;
DROP POLICY IF EXISTS "Admin Masters can view system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin Masters can update system settings" ON public.system_settings;

CREATE POLICY "Admin Masters can view system settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::public.app_role));

CREATE POLICY "Admin Masters can update system settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));
