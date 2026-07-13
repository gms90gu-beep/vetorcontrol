
-- Ensure ON CONFLICT (legacy_agent_id, work_date) is detected by PostgREST and RLS allows self/supervisor/admin updates.

-- 1) Re-affirm unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_work_records'::regclass
      AND conname = 'daily_work_records_legacy_agent_work_date_key'
  ) THEN
    -- Drop legacy-named one if present, then recreate with canonical name
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.daily_work_records'::regclass
        AND conname = 'daily_work_records_agent_date_unique'
    ) THEN
      ALTER TABLE public.daily_work_records
        DROP CONSTRAINT daily_work_records_agent_date_unique;
    END IF;
    ALTER TABLE public.daily_work_records
      ADD CONSTRAINT daily_work_records_legacy_agent_work_date_key
      UNIQUE (legacy_agent_id, work_date);
  END IF;
END $$;

-- 2) RLS: broaden update/insert/select so agent, supervisor and admin_master
--    podem manter o próprio DWR sem violar policy.
DROP POLICY IF EXISTS "Agents can insert their own records" ON public.daily_work_records;
DROP POLICY IF EXISTS "Agents can update their own records" ON public.daily_work_records;
DROP POLICY IF EXISTS "Daily records visible by owner or linked supervisors" ON public.daily_work_records;

CREATE POLICY "dwr_select_owner_supervisor_admin"
  ON public.daily_work_records
  FOR SELECT
  TO authenticated
  USING (
    public.can_supervise_user(agent_id)
    OR public.has_role(auth.uid(), 'admin_master')
  );

CREATE POLICY "dwr_insert_self_or_admin"
  ON public.daily_work_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    OR legacy_agent_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "dwr_update_self_or_admin"
  ON public.daily_work_records
  FOR UPDATE
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR legacy_agent_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'supervisor')
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR legacy_agent_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'supervisor')
  );

-- 3) Reload PostgREST schema cache so the new constraint name is picked up
NOTIFY pgrst, 'reload schema';
