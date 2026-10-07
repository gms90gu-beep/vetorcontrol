import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

// Evaluate the installed database policies with real role records, without
// inserting settings or changing identities/credentials in the database.
function query(sql: string): any[] {
  const output = execFileSync("lovable", ["supabase", "query", sql, "--json"], {
    encoding: "utf8", timeout: 60000,
  });
  return JSON.parse(output).rows;
}

describe("installed system settings access rules", () => {
  let readRule = "false";
  let writeRule = "false";
  const users = {
    admin_master: "5cc3230f-75c7-410a-9796-f46ce0e8df8a",
    supervisor: "26655451-27cd-4abe-a019-42fe1be2fbb3",
    coordenador: "8c9869e6-d48d-4e8f-83ef-97b95acce004",
    agente: "30f520ba-b5b8-4516-932e-0008ceab854d",
  };

  beforeAll(() => {
    const policies = query("select cmd, qual, with_check from pg_policies where schemaname='public' and tablename='system_settings'");
    readRule = policies.filter((p) => ["SELECT", "ALL"].includes(p.cmd)).map((p) => `(${p.qual})`).join(" OR ") || "false";
    writeRule = policies.filter((p) => ["INSERT", "ALL"].includes(p.cmd)).map((p) => `(${p.with_check})`).join(" OR ") || "false";
  }, 60000);

  function allowed(userId: string, scope: string, rule: string): boolean {
    // The read-only audit connection cannot EXECUTE auth helpers. Expand
    // has_role using its installed EXISTS definition and real user_roles rows.
    const expanded = rule.replace(/has_role\(auth\.uid\(\), '([^']+)'::app_role\)/g,
      (_match, role) => `EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '${userId}'::uuid AND role = '${role}'::public.app_role)`);
    const rows = query(`SELECT (${expanded}) AS allowed FROM (VALUES ('${scope}'::text)) AS settings(access_scope)`);
    return rows[0]?.allowed === true;
  }

  it("keeps RLS enabled", () => {
    expect(query("select relrowsecurity as enabled from pg_class where oid='public.system_settings'::regclass")[0]?.enabled).toBe(true);
  }, 60000);
  it("master reads administrative settings", () => {
    expect(allowed(users.admin_master, "administrative", readRule)).toBe(true);
  }, 60000);
  it("master manages administrative settings", () => {
    expect(allowed(users.admin_master, "administrative", writeRule)).toBe(true);
  }, 60000);
  it.each(["supervisor", "coordenador"] as const)("%s reads only explicitly operational settings", (role) => {
    expect(allowed(users[role], "operational", readRule)).toBe(true);
    expect(allowed(users[role], "administrative", readRule)).toBe(false);
  }, 60000);
  it.each(["supervisor", "coordenador"] as const)("%s cannot promote a setting to operational", (role) => {
    expect(allowed(users[role], "operational", writeRule)).toBe(false);
  }, 60000);
  it("agent cannot read administrative settings", () => {
    expect(allowed(users.agente, "administrative", readRule)).toBe(false);
  }, 60000);
  it("unknown users cannot read administrative settings", () => {
    expect(allowed("00000000-0000-0000-0000-000000000000", "administrative", readRule)).toBe(false);
  }, 60000);
});