-- Corrige RLS de field_work_sessions: supervisores/coordenadores/admin_master
-- nunca conseguiam ver as sessoes de campo da propria equipe.
--
-- A policy de SELECT era "auth.uid() = user_id" (dono unico), diferente de
-- visits/properties/profiles, que ja usam can_supervise_user() para liberar
-- visibilidade de equipe. Isso quebrava silenciosamente (sem erro, so
-- retornava vazio) dois indicadores da area do supervisor:
--   - SupervisionDashboard: "Sem sessao hoje" aparecia para TODOS os agentes,
--     mesmo quem estava trabalhando naquele momento (hasOpenSession/
--     hasAnyToday sempre false).
--   - CoordinatorDashboard: card "Jornadas Ativas" sempre mostrava 0.
--
-- INSERT/UPDATE continuam restritos ao proprio dono (agente so mexe na
-- propria sessao) — so a leitura ganha o escopo de equipe.
DROP POLICY IF EXISTS "Users can view their own field work sessions" ON public.field_work_sessions;

CREATE POLICY "Users and supervisors can view team field work sessions"
  ON public.field_work_sessions FOR SELECT TO authenticated
  USING (public.can_supervise_user(user_id));
