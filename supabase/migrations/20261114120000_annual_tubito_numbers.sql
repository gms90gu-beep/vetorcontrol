-- NULL preserves legacy collections. The array stores one collected deposit type per tube.
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS tubito_deposit_types text[];

CREATE TABLE public.collection_tubitos (
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  agent_id uuid NOT NULL,
  collection_year integer NOT NULL,
  serial integer NOT NULL CHECK (serial > 0),
  collection_number integer NOT NULL CHECK (collection_number > 0),
  deposit_type text NOT NULL CHECK (deposit_type IN ('A1','A2','B','C','D1','D2','E')),
  PRIMARY KEY (visit_id, position),
  UNIQUE (agent_id, collection_year, serial)
);
ALTER TABLE public.collection_tubitos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_tubitos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.collection_tubitos TO authenticated;
CREATE POLICY read_collection_tubitos ON public.collection_tubitos FOR SELECT TO authenticated
  USING (private.focus_access(agent_id, false));

-- Counters persist even if a visit is cancelled or removed.
CREATE TABLE private.tubito_annual_counters (
  agent_id uuid NOT NULL,
  collection_year integer NOT NULL,
  last_serial integer NOT NULL CHECK (last_serial > 0),
  last_collection integer NOT NULL CHECK (last_collection > 0),
  PRIMARY KEY (agent_id, collection_year)
);
REVOKE ALL ON private.tubito_annual_counters FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.number_collection_tubitos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  collection_year integer;
  tube_count integer;
  last_serial integer;
  collection_number integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tubito_deposit_types IS NOT NULL THEN
    IF NEW.tubito_deposit_types IS DISTINCT FROM OLD.tubito_deposit_types
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR (NEW.visit_date AT TIME ZONE 'America/Sao_Paulo')::date IS DISTINCT FROM (OLD.visit_date AT TIME ZONE 'America/Sao_Paulo')::date
       OR NEW.tubitos_coletados IS DISTINCT FROM OLD.tubitos_coletados
       OR NEW.sample_collected IS DISTINCT FROM OLD.sample_collected THEN
      RAISE EXCEPTION 'Coleta numerada: preserve os tubitos e os dados de origem.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.tubito_deposit_types IS NULL THEN RETURN NEW; END IF;

  tube_count := cardinality(NEW.tubito_deposit_types);
  IF NEW.sample_collected IS NOT TRUE OR NEW.visit_date IS NULL OR NEW.agent_id IS NULL
     OR tube_count NOT BETWEEN 1 AND 100 OR NEW.tubitos_coletados IS DISTINCT FROM tube_count
     OR EXISTS (
       SELECT 1 FROM unnest(NEW.tubito_deposit_types) AS d(code)
       WHERE code IS NULL OR code NOT IN ('A1','A2','B','C','D1','D2','E')
     ) THEN
    RAISE EXCEPTION 'Informe o depósito de origem de cada tubito.';
  END IF;

  collection_year := EXTRACT(YEAR FROM NEW.visit_date AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO private.tubito_annual_counters AS counters (agent_id, collection_year, last_serial, last_collection)
  VALUES (NEW.agent_id, collection_year, tube_count, 1)
  ON CONFLICT ON CONSTRAINT tubito_annual_counters_pkey DO UPDATE
    SET last_serial = counters.last_serial + EXCLUDED.last_serial,
        last_collection = counters.last_collection + 1
  RETURNING counters.last_serial, counters.last_collection INTO last_serial, collection_number;

  INSERT INTO public.collection_tubitos (visit_id, position, agent_id, collection_year, serial, collection_number, deposit_type)
  SELECT NEW.id, d.position, NEW.agent_id, collection_year, last_serial - tube_count + d.position, collection_number, d.code
  FROM unnest(NEW.tubito_deposit_types) WITH ORDINALITY AS d(code, position);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.number_collection_tubitos() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER number_collection_tubitos
AFTER INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION private.number_collection_tubitos();

CREATE FUNCTION private.preserve_numbered_tubito_origins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- During a cascading visit delete the parent is already gone.
    IF EXISTS (
      SELECT 1 FROM public.visits v WHERE v.id = OLD.visit_id
        AND OLD.type_code = ANY(v.tubito_deposit_types)
    ) THEN RAISE EXCEPTION 'Depósito de origem de um tubito numerado.'; END IF;
    RETURN OLD;
  END IF;
  IF (NEW.visit_id IS DISTINCT FROM OLD.visit_id
      OR NEW.type_code IS DISTINCT FROM OLD.type_code
      OR NEW.focus_found IS NOT TRUE)
    AND EXISTS (
      SELECT 1 FROM public.visits v WHERE v.id = OLD.visit_id
        AND OLD.type_code = ANY(v.tubito_deposit_types)
    ) THEN RAISE EXCEPTION 'Preserve o depósito de origem do tubito numerado.'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.preserve_numbered_tubito_origins() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_numbered_tubito_origins
BEFORE UPDATE OR DELETE ON public.visit_deposits
FOR EACH ROW EXECUTE FUNCTION private.preserve_numbered_tubito_origins();
