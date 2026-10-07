import { describe, expect, it } from "vitest";
import { getAgentRebuildRange, getRebuildAuthorizationError } from "@/lib/reports-reconcile-policy";

describe("daily report rebuild authorization", () => {
  it("limits agents to their own daily reports", () => {
    expect(getRebuildAuthorizationError({
      role: "agente",
      userId: "profile-1",
      agentId: "profile-1",
      from: "2026-07-03",
      to: "2026-09-30",
      today: "2026-09-30",
    })).toBeNull();

    expect(getRebuildAuthorizationError({
      role: "agente",
      userId: "profile-1",
      agentId: "profile-2",
      from: "2026-09-29",
      to: "2026-09-30",
      today: "2026-09-30",
    })).toMatch(/próprios boletins/);
  });

  it("limits agent rebuilds to 90 days and rejects future dates", () => {
    expect(getRebuildAuthorizationError({
      role: "agente",
      userId: "profile-1",
      agentId: "profile-1",
      from: "2026-07-02",
      to: "2026-09-30",
      today: "2026-09-30",
    })).toMatch(/últimos 90 dias/);

    expect(getRebuildAuthorizationError({
      role: "agente",
      userId: "profile-1",
      agentId: "profile-1",
      from: "2026-09-30",
      to: "2026-10-01",
      today: "2026-09-30",
    })).toMatch(/últimos 90 dias/);
  });

  it("keeps manager rebuild access and rejects invalid date-only values", () => {
    expect(getRebuildAuthorizationError({
      role: "supervisor",
      userId: "supervisor-1",
      agentId: "agent-2",
      supervisedAgentIds: ["agent-2"],
      from: "2026-01-01",
      to: "2026-12-31",
      today: "2026-09-30",
    })).toBeNull();

    expect(getRebuildAuthorizationError({
      role: "agente",
      userId: "profile-1",
      agentId: "profile-1",
      from: "2026-02-30",
      to: "2026-09-30",
      today: "2026-09-30",
    })).toMatch(/datas inválido/);
  });

  it("builds an inclusive 90-day window", () => {
    expect(getAgentRebuildRange("2026-09-30")).toEqual({
      from: "2026-07-03",
      to: "2026-09-30",
    });
  });

  it("rejects another team and missing supervisor scope", () => {
    const input = { role: "supervisor", userId: "s", agentId: "other", from: "2026-09-01", to: "2026-09-30", today: "2026-09-30" };
    expect(getRebuildAuthorizationError({ ...input, supervisedAgentIds: ["own"] })).toMatch(/própria equipe/);
    expect(getRebuildAuthorizationError(input)).toMatch(/própria equipe/);
  });
});
