-- Fix search_path for functions
ALTER FUNCTION public.ensure_annual_cycles(INTEGER) SET search_path = public;
ALTER FUNCTION public.handle_cycle_transition() SET search_path = public;
ALTER FUNCTION public.check_cycle_status_for_visit() SET search_path = public;

-- Ensure view is secure
ALTER VIEW public.annual_report_summary SET (security_invoker = true);
