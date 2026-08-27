import { describe, it, expect } from "vitest";
import { resolveOperationalCloseTarget } from "@/lib/operational-date";

/**
 * Testes de regressão — Prioridade da data retroativa.
 *
 * Contexto: bug crítico em produção onde uma jornada retroativa aberta para
 * 24/08, com visitas digitadas em 27/08, era encerrada com work_date = 27/08
 * (data das visitas / data do relógio) em vez de 24/08 (data intencional da
 * sessão retroativa). `resolveOperationalCloseTarget` foi corrigido para
 * tratar a session_date retroativa como soberana. Estes testes travam essa
 * regressão: se alguém voltar a usar a data das visitas ou do sistema, eles
 * falham.
 *
 * Regra de ouro: a data de uma sessão retroativa (is_retroactive=true) é
 * soberana sobre a data das visitas e sobre "hoje", mesmo quando as visitas
 * foram digitadas em outro dia.
 */
describe("Retroactive Date Priority (Bug Prevention)", () => {
  it("uses retroactive session date, not visit date", () => {
    // Cenário: Sessão retroativa para 24/08, mas visitas digitadas em 27/08 (hoje).
    const retroactiveSessions = [
      {
        id: "session-retroactive-24",
        session_date: "2026-08-24", // ← Data intencional (retroativo)
        is_retroactive: true,
        status: "in_progress",
        created_at: "2026-08-27T09:00:00Z",
        updated_at: "2026-08-27T12:00:00Z",
      },
    ];

    const visitsToday = [
      {
        field_work_session_id: "session-retroactive-24",
        visit_date: "2026-08-27T10:00:00-03:00", // ← Digitada hoje
      },
      {
        field_work_session_id: "session-retroactive-24",
        visit_date: "2026-08-27T11:00:00-03:00", // ← Digitada hoje
      },
    ];

    const result = resolveOperationalCloseTarget(
      retroactiveSessions,
      visitsToday,
      "2026-08-27", // todayOperational
    );

    // ✅ DEVE usar 24/08 (data da sessão retroativa), NÃO 27/08 (data das visitas)
    expect(result.workDate).toBe("2026-08-24");
    expect(result.source).toBe("retroactive_session");
    expect(result.sessionId).toBe("session-retroactive-24");
  });

  it("does not mix retroactive and non-retroactive sessions", () => {
    // Cenário: 2 sessões abertas — uma retroativa (24/08) e outra normal (27/08).
    const sessions = [
      {
        id: "session-retroactive-24",
        session_date: "2026-08-24",
        is_retroactive: true,
        status: "in_progress",
        created_at: "2026-08-27T09:00:00Z",
      },
      {
        id: "session-normal-27",
        session_date: "2026-08-27",
        is_retroactive: false,
        status: "in_progress",
        created_at: "2026-08-27T09:00:00Z",
      },
    ];

    const visits = [
      {
        field_work_session_id: "session-retroactive-24",
        visit_date: "2026-08-24T16:00:00-03:00",
      },
      {
        field_work_session_id: "session-normal-27",
        visit_date: "2026-08-27T16:00:00-03:00",
      },
    ];

    const result = resolveOperationalCloseTarget(sessions, visits, "2026-08-27");

    // ✅ Quando há retroativa aberta, ela tem prioridade sobre a sessão normal
    expect(result.workDate).toBe("2026-08-24");
    expect(result.source).toBe("retroactive_session");
    expect(result.sessionId).toBe("session-retroactive-24");
  });

  it("never falls back to system today when a retroactive session is open", () => {
    // Cenário: sessão retroativa aberta, mas sem visitas registradas ainda.
    const result = resolveOperationalCloseTarget(
      [
        {
          id: "session-retroactive-24",
          session_date: "2026-08-24",
          is_retroactive: true,
          status: "in_progress",
          updated_at: "2026-08-27T12:00:00Z",
        },
      ],
      [], // sem visitas
      "2026-08-27",
    );

    expect(result.workDate).toBe("2026-08-24");
    expect(result.source).toBe("retroactive_session");
  });

  it("returns the retroactive date even if visits happened on a later day", () => {
    // Cenário: visit_date é posterior à session_date retroativa.
    // Reforça que a data do formulário retroativo vence a data da visita.
    const result = resolveOperationalCloseTarget(
      [
        {
          id: "s-retro",
          session_date: "2026-08-24",
          is_retroactive: true,
          status: "in_progress",
          created_at: "2026-08-24T10:00:00Z",
        },
      ],
      [
        {
          field_work_session_id: "s-retro",
          visit_date: "2026-08-29T18:00:00-03:00", // 5 dias depois
        },
      ],
      "2026-08-29",
    );

    expect(result.workDate).toBe("2026-08-24");
    expect(result.source).toBe("retroactive_session");
  });
});
