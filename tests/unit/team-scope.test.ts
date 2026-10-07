import { describe, expect, it } from "vitest";
import { selectPermittedAgentIds } from "@/lib/team-scope";

describe("team scope", () => {
  it("restricts supervisor to linked profiles", () => {
    expect(selectPermittedAgentIds("supervisor", "s", ["a"], "a")).toEqual(["a"]);
    expect(() => selectPermittedAgentIds("supervisor", "s", ["a"], "b")).toThrow(/equipe/);
    expect(selectPermittedAgentIds("supervisor", "s", [], undefined)).toEqual([]);
  });
  it.each(["agent", "agente"])("keeps %s self scoped", (role) => {
    expect(selectPermittedAgentIds(role, "a", ["b"])).toEqual(["a"]);
    expect(() => selectPermittedAgentIds(role, "a", [], "b")).toThrow();
  });
  it.each(["coordenador", "admin_master"])("preserves %s global scope", (role) => {
    expect(selectPermittedAgentIds(role, "s", [])).toBeNull();
    expect(selectPermittedAgentIds(role, "s", [], "b")).toEqual(["b"]);
  });
});