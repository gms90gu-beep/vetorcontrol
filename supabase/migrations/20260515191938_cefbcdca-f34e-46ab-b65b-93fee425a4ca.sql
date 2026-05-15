-- Fix functions search path
ALTER FUNCTION public.check_block_completion(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.on_visit_upsert_update_block() SET search_path = public;

-- Fix view security invoker (Postgres 15+ syntax or just ensure it's standard)
-- In Supabase/standard PG, we should drop and recreate with explicit options if needed
-- Actually, the linter says "Detects views defined with the SECURITY DEFINER property".
-- Views in PG are usually SECURITY INVOKER. I'll recreate it explicitly if possible or just ensure it's clean.
DROP VIEW IF EXISTS public.cycle_coverage_summary;
CREATE OR REPLACE VIEW public.cycle_coverage_summary WITH (security_invoker = true) AS
SELECT 
    c.id as cycle_id,
    c.name as cycle_name,
    count(DISTINCT p.id) as total_properties,
    count(DISTINCT v.property_id) as worked_properties,
    CASE 
        WHEN count(DISTINCT p.id) = 0 THEN 0
        ELSE ROUND((count(DISTINCT v.property_id)::NUMERIC / count(DISTINCT p.id)::NUMERIC) * 100, 2)
    END as coverage_percentage
FROM 
    public.cycles c
LEFT JOIN 
    public.visits v ON v.cycle_id = c.id
CROSS JOIN 
    public.properties p
GROUP BY 
    c.id, c.name;
