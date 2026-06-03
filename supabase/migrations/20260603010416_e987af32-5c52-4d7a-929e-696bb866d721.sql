
-- Table: boletins_rg
CREATE TABLE public.boletins_rg (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES public.blocks(id) ON DELETE SET NULL,
  block_number TEXT,
  agent_id UUID NOT NULL,
  uf TEXT,
  municipality TEXT,
  locality TEXT,
  sublocality TEXT,
  district TEXT,
  subdistrict TEXT,
  category_1 TEXT,
  category_2 TEXT,
  sequence TEXT,
  side TEXT,
  inspector_general TEXT,
  inspector TEXT,
  team_lead TEXT,
  agent_name TEXT,
  agent_registration TEXT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boletins_rg TO authenticated;
GRANT ALL ON public.boletins_rg TO service_role;

ALTER TABLE public.boletins_rg ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Boletins visible by owner or supervisors"
  ON public.boletins_rg FOR SELECT TO authenticated
  USING (public.can_supervise_user(agent_id));

CREATE POLICY "Agents can insert their own boletins"
  ON public.boletins_rg FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Owner or supervisors can update boletins"
  ON public.boletins_rg FOR UPDATE TO authenticated
  USING (public.can_supervise_user(agent_id))
  WITH CHECK (public.can_supervise_user(agent_id));

CREATE POLICY "Admin master can delete boletins"
  ON public.boletins_rg FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::app_role));

CREATE TRIGGER boletins_rg_updated_at
  BEFORE UPDATE ON public.boletins_rg
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_boletins_rg_block_id ON public.boletins_rg(block_id);
CREATE INDEX idx_boletins_rg_agent_id ON public.boletins_rg(agent_id);

-- Link properties to a boletim
ALTER TABLE public.properties ADD COLUMN boletim_id UUID REFERENCES public.boletins_rg(id) ON DELETE SET NULL;
CREATE INDEX idx_properties_boletim_id ON public.properties(boletim_id);
