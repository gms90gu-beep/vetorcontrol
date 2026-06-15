
-- 1) Tabela de snapshots
CREATE TABLE IF NOT EXISTS public.data_audit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  score integer NOT NULL,
  alerts_count integer NOT NULL DEFAULT 0,
  actions_count integer NOT NULL DEFAULT 0,
  module_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid
);

GRANT SELECT, INSERT ON public.data_audit_snapshots TO authenticated;
GRANT ALL ON public.data_audit_snapshots TO service_role;

ALTER TABLE public.data_audit_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin master can read snapshots" ON public.data_audit_snapshots;
CREATE POLICY "admin master can read snapshots"
  ON public.data_audit_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::app_role));

DROP POLICY IF EXISTS "admin master can insert snapshots" ON public.data_audit_snapshots;
CREATE POLICY "admin master can insert snapshots"
  ON public.data_audit_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'::app_role));

CREATE INDEX IF NOT EXISTS data_audit_snapshots_created_idx
  ON public.data_audit_snapshots (created_at DESC);

-- 2) Função: salva snapshot a partir do data_audit_report()
CREATE OR REPLACE FUNCTION public.save_data_audit_snapshot(
  _score integer,
  _module_scores jsonb,
  _alerts_count integer DEFAULT 0,
  _actions_count integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_report jsonb;
BEGIN
  v_report := public.data_audit_report();
  INSERT INTO public.data_audit_snapshots
    (score, alerts_count, actions_count, module_scores, report, user_id)
  VALUES
    (_score, _alerts_count, _actions_count, _module_scores, v_report, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 3) Função: snapshot automático (cron) — calcula score básico server-side
CREATE OR REPLACE FUNCTION public.auto_data_audit_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_report jsonb;
  v_score int := 100;
  v_alerts int := 0;
  v_id uuid;
BEGIN
  v_report := public.data_audit_report();

  -- Alertas básicos
  v_alerts :=
    COALESCE((v_report->'properties'->>'without_block')::int, 0)
    + COALESCE((v_report->'gps'->>'missing')::int, 0)
    + COALESCE((v_report->'visits'->>'orphan')::int, 0)
    + COALESCE((v_report->'foci'->>'positive_without_deposit')::int, 0)
    + COALESCE((v_report->'users'->>'agents_without_supervisor')::int, 0)
    + CASE WHEN (v_report->'cycles'->>'multiple_in_progress')::boolean THEN 1 ELSE 0 END
    + COALESCE((v_report->'cycles'->>'expired_in_progress')::int, 0);

  INSERT INTO public.data_audit_snapshots
    (score, alerts_count, actions_count, module_scores, report, user_id)
  VALUES
    (v_score, v_alerts, 0, '{}'::jsonb, v_report, NULL)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'alerts', v_alerts);
END;
$$;

-- 4) Cron diário 00:10
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto-data-audit-snapshot') 
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-data-audit-snapshot');
    PERFORM cron.schedule(
      'auto-data-audit-snapshot',
      '10 0 * * *',
      $cron$ SELECT public.auto_data_audit_snapshot(); $cron$
    );
  END IF;
END $$;
