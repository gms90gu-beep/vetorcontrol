ALTER TABLE public.visits DISABLE TRIGGER USER;

WITH ranked AS (
  SELECT s.id,
         ROW_NUMBER() OVER (
           PARTITION BY s.user_id, s.session_date, s.block_id
           ORDER BY (SELECT count(*) FROM public.visits v WHERE v.field_work_session_id = s.id) DESC,
                    s.created_at DESC
         ) AS rn
    FROM public.field_work_sessions s
   WHERE s.block_id IS NOT NULL
)
DELETE FROM public.field_work_sessions
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.visits ENABLE TRIGGER USER;

CREATE UNIQUE INDEX IF NOT EXISTS field_work_sessions_user_date_block_unique
  ON public.field_work_sessions (user_id, session_date, block_id)
  WHERE block_id IS NOT NULL;