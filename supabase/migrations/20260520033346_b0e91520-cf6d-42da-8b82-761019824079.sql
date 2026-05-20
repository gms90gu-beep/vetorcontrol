ALTER TABLE public.visits 
ADD COLUMN IF NOT EXISTS tubitos_coletados INTEGER DEFAULT 0;

COMMENT ON COLUMN public.visits.tubitos_coletados IS 'Number of collected sample tubes during the visit';