
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- rg_records
CREATE TABLE IF NOT EXISTS public.rg_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rg_records TO authenticated;
GRANT ALL ON public.rg_records TO service_role;
ALTER TABLE public.rg_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can manage own rg_records" ON public.rg_records
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- field_work_records
CREATE TABLE IF NOT EXISTS public.field_work_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'active',
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_work_records TO authenticated;
GRANT ALL ON public.field_work_records TO service_role;
ALTER TABLE public.field_work_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can manage own field_work_records" ON public.field_work_records
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- pending_records
CREATE TABLE IF NOT EXISTS public.pending_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reason text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_records TO authenticated;
GRANT ALL ON public.pending_records TO service_role;
ALTER TABLE public.pending_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can manage own pending_records" ON public.pending_records
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS rg_records_user_id_idx ON public.rg_records(user_id);
CREATE INDEX IF NOT EXISTS rg_records_updated_at_idx ON public.rg_records(updated_at);
CREATE INDEX IF NOT EXISTS field_work_records_user_id_idx ON public.field_work_records(user_id);
CREATE INDEX IF NOT EXISTS field_work_records_updated_at_idx ON public.field_work_records(updated_at);
CREATE INDEX IF NOT EXISTS pending_records_user_id_idx ON public.pending_records(user_id);
CREATE INDEX IF NOT EXISTS pending_records_entity_id_idx ON public.pending_records(entity_id);

-- Triggers updated_at (reutiliza public.update_updated_at_column já existente)
CREATE TRIGGER rg_records_updated_at BEFORE UPDATE ON public.rg_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER field_work_records_updated_at BEFORE UPDATE ON public.field_work_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pending_records_updated_at BEFORE UPDATE ON public.pending_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
