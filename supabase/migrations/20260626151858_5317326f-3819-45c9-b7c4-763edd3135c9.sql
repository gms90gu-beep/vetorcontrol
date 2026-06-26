-- 1. Dropar policies antigas que dependem da coluna
DROP POLICY IF EXISTS "Daily records visible by owner or linked supervisors" ON public.daily_work_records;
DROP POLICY IF EXISTS "Agents can insert their own records" ON public.daily_work_records;
DROP POLICY IF EXISTS "Agents can update their own records" ON public.daily_work_records;

-- 2. Renomear coluna atual (que guarda agents.id) e remover FK p/ agents
ALTER TABLE public.daily_work_records DROP CONSTRAINT IF EXISTS daily_work_records_agent_id_fkey;
ALTER TABLE public.daily_work_records RENAME COLUMN agent_id TO legacy_agent_id;

-- 3. Criar nova coluna agent_id apontando para profiles.id
ALTER TABLE public.daily_work_records ADD COLUMN agent_id uuid;

-- 4. Backfill via agents.profile_id
UPDATE public.daily_work_records dwr
   SET agent_id = a.profile_id
  FROM public.agents a
 WHERE a.id = dwr.legacy_agent_id;

-- 5. Tornar NOT NULL + FK p/ profiles
ALTER TABLE public.daily_work_records
  ALTER COLUMN agent_id SET NOT NULL,
  ADD CONSTRAINT daily_work_records_agent_id_profile_fkey
    FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_dwr_agent_id ON public.daily_work_records(agent_id);

-- 6. Recriar RLS policies usando profile_id direto
CREATE POLICY "Daily records visible by owner or linked supervisors"
ON public.daily_work_records
FOR SELECT
USING (public.can_supervise_user(agent_id));

CREATE POLICY "Agents can insert their own records"
ON public.daily_work_records
FOR INSERT
WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Agents can update their own records"
ON public.daily_work_records
FOR UPDATE
USING (agent_id = auth.uid());