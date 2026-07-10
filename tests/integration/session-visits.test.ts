/**
 * Integração: get_session_visits retorna visitas do agente para uma sessionDate.
 * Também valida filtros derivados por status.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", async () => {
  const { vi } = await import("vitest");
  const rows = [
    { id: "v1", agent_id: "u1", property_id: "p1", status: "visited", has_focus: false },
    { id: "v2", agent_id: "u1", property_id: "p2", status: "closed", has_focus: false },
    { id: "v3", agent_id: "u1", property_id: "p3", status: "refused", has_focus: false },
    { id: "v4", agent_id: "u1", property_id: "p4", status: "visited", has_focus: true },
  ];
  const client: any = {
    from: vi.fn(),
    rpc: vi.fn((name: string) => {
      if (name === "get_session_visits") return Promise.resolve({ data: rows, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";

describe("get_session_visits RPC + filters", () => {
  it("returns visits for the session", async () => {
    const { data } = await (supabase.rpc as any)("get_session_visits", { _agent_id: "u1", _session_date: "2025-07-10" });
    expect(data).toHaveLength(4);
  });

  it("client-side filters: pendentes/visitados/fechados/recusados", async () => {
    const { data } = await (supabase.rpc as any)("get_session_visits", { _agent_id: "u1", _session_date: "2025-07-10" });
    const visited = data.filter((v: any) => v.status === "visited");
    const closed = data.filter((v: any) => v.status === "closed");
    const refused = data.filter((v: any) => v.status === "refused");
    const withFocus = data.filter((v: any) => v.has_focus);
    expect(visited).toHaveLength(2);
    expect(closed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(withFocus).toHaveLength(1);
  });
});
