
-- 1. Add coordinator_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coordinator_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_coordinator_id ON public.profiles(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_profiles_supervisor_id ON public.profiles(supervisor_id);

-- 2. Update can_supervise_user to walk the Coordenador → Supervisor → Agente chain
CREATE OR REPLACE FUNCTION public.can_supervise_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- self
    auth.uid() = target_user_id
    -- admin master: unrestricted
    OR public.get_user_role(auth.uid()) = 'admin_master'
    -- coordenador: own supervisors + agents under those supervisors
    OR (
      public.get_user_role(auth.uid()) = 'coordenador'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_user_id
          AND (
            p.coordinator_id = auth.uid()
            OR p.supervisor_id IN (
              SELECT s.id FROM public.profiles s WHERE s.coordinator_id = auth.uid()
            )
          )
      )
    )
    -- supervisor: own agents
    OR (
      public.get_user_role(auth.uid()) = 'supervisor'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = target_user_id AND p.supervisor_id = auth.uid()
      )
    );
$$;

-- 3. Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_email TEXT,
  target_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT 'user',
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_id ON public.audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin master can view all audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin_master'::app_role));
