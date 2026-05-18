-- Remove the weekend operation column as it is no longer needed
ALTER TABLE public.system_settings 
DROP COLUMN IF EXISTS allow_weekend_operation;

-- Ensure there is at least one row in system_settings if it's used elsewhere
INSERT INTO public.system_settings (id) 
SELECT gen_random_uuid() 
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);
