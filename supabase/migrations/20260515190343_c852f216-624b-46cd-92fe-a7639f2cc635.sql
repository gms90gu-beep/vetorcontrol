-- Fix security warning for get_epi_week
ALTER FUNCTION public.get_epi_week(DATE) SET search_path = public;
