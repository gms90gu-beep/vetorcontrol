-- Garante unicidade por (agent_id, work_date) para que o upsert do encerramento da jornada
-- funcione (onConflict precisa de constraint correspondente).
ALTER TABLE public.daily_work_records
  ADD CONSTRAINT daily_work_records_agent_date_unique UNIQUE (agent_id, work_date);