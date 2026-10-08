import { execFileSync } from "node:child_process";
import { beforeAll, expect, it } from "vitest";

let functions: { proname: string; definition: string; acl: string }[] = [];
beforeAll(() => {
  const output = execFileSync("lovable", ["supabase", "query", "select proname, pg_get_functiondef(oid) as definition, proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('rebuild_daily_work_records','rebuild_dwr_after_session_close')", "--json"], { encoding: "utf8", timeout: 60000 });
  functions = JSON.parse(output).rows;
}, 60000);

it("restricts both installed SQL reconstruction functions to service_role", () => {
  expect(functions).toHaveLength(2);
  for (const fn of functions) {
    expect(fn.acl).toContain("service_role=X/");
    expect(fn.acl).not.toMatch(/(?:authenticated|anon)=X|\{=X|,=X/);
  }
});
it("installed reconstruction exception records its real failure in audit_log", () => {
  const fn = functions.find(f => f.proname === "rebuild_daily_work_records");
  expect(fn?.definition).toMatch(/EXCEPTION WHEN OTHERS THEN\s+INSERT INTO public.audit_log/);
  expect(fn?.definition).toContain("'dwr_reconciliation_failed'");
  expect(fn?.definition).toContain("'sqlstate', SQLSTATE, 'error', SQLERRM");
});
it("installed closure trigger audits failures and returns the closed journey", () => {
  const fn = functions.find(f => f.proname === "rebuild_dwr_after_session_close");
  const exception = fn?.definition.slice(fn.definition.indexOf("EXCEPTION"));
  expect(exception).toContain("'dwr_reconciliation_failed'");
  expect(exception).toContain("RETURN NEW;");
});