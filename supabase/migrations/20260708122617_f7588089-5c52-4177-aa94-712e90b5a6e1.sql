
ALTER TABLE public.field_work_sessions
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_field_work_sessions_block_id
  ON public.field_work_sessions(block_id);

UPDATE public.field_work_sessions s
SET block_id = sub.block_id
FROM (
  SELECT DISTINCT ON (s2.id) s2.id AS session_id, b.id AS block_id
  FROM public.field_work_sessions s2
  JOIN public.boletins_rg br ON br.agent_id = s2.user_id
  JOIN public.blocks b ON b.id = br.block_id
  WHERE s2.block_id IS NULL
    AND s2.block_number IS NOT NULL
    AND b.number = s2.block_number
  ORDER BY s2.id, b.id
) sub
WHERE s.id = sub.session_id
  AND s.block_id IS NULL;

UPDATE public.field_work_sessions s
SET block_id = b.id
FROM public.blocks b
WHERE s.block_id IS NULL
  AND s.block_number IS NOT NULL
  AND b.number = s.block_number;
