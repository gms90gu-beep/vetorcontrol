-- O dia 01/10/2026 foi uma produção real usada para validar o fluxo de
-- produção futura. Não é um registro descartável nem uma sessão sem validade.
-- Recalcula o boletim a partir das visitas reais do agente, sem apagar,
-- encerrar ou alterar o status da sessão futura.

SELECT public.rebuild_daily_work_records(
  '2026-10-01'::date,
  '2026-10-01'::date,
  '30f520ba-b5b8-4516-932e-0008ceab854d'::uuid
);

NOTIFY pgrst, 'reload schema';
