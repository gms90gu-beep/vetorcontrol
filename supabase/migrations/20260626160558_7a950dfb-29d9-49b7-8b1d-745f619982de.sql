UPDATE public.properties p
SET boletim_id = b.id
FROM public.boletins_rg b
WHERE p.boletim_id IS NULL
  AND p.block_id IS NOT NULL
  AND b.block_id = p.block_id;