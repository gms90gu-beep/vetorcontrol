
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocoded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_lat_lng
  ON public.properties (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_property_geocode_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  geo_changed boolean;
BEGIN
  geo_changed :=
    (NEW.latitude IS DISTINCT FROM OLD.latitude)
    OR (NEW.longitude IS DISTINCT FROM OLD.longitude);

  IF NOT geo_changed THEN
    RETURN NEW;
  END IF;

  caller_role := public.get_user_role(auth.uid());

  -- Agentes só podem registrar a localização quando ainda não existir.
  IF caller_role NOT IN ('admin_master','coordenador','supervisor') THEN
    IF OLD.latitude IS NOT NULL OR OLD.longitude IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas supervisor ou admin master podem corrigir a localização de um imóvel já georreferenciado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geocoded_at := COALESCE(NEW.geocoded_at, now());
    NEW.geocoded_by := COALESCE(NEW.geocoded_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_property_geocode_update ON public.properties;
CREATE TRIGGER trg_enforce_property_geocode_update
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.enforce_property_geocode_update();
