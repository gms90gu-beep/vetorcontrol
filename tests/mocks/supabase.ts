/**
 * Minimal chainable Supabase client mock for tests.
 * Every terminal call (single, maybeSingle, then, throwOnError, etc.)
 * resolves to { data, error } from the configured fixtures.
 */
import { vi } from "vitest";

type Row = Record<string, any>;
type TableFixture = { rows?: Row[]; error?: any; onInsert?: (r: any) => any; onUpsert?: (r: any) => any };
type RpcFixture = { data?: any; error?: any; impl?: (args: any) => any };

export interface SupabaseFixtures {
  tables?: Record<string, TableFixture>;
  rpc?: Record<string, RpcFixture>;
  user?: { id: string; email?: string } | null;
}

export function createSupabaseMock(fixtures: SupabaseFixtures = {}) {
  const callLog: Array<{ kind: string; table?: string; rpc?: string; args?: any }> = [];

  const makeBuilder = (table: string) => {
    const state: any = { table, filters: [], selected: "*" };
    const fx = fixtures.tables?.[table] ?? {};

    const resolve = () => Promise.resolve({ data: fx.rows ?? [], error: fx.error ?? null, count: fx.rows?.length ?? 0 });
    const resolveSingle = () => {
      const rows = fx.rows ?? [];
      return Promise.resolve({ data: rows[0] ?? null, error: fx.error ?? null });
    };

    const chain: any = {
      select: vi.fn((cols?: string) => { state.selected = cols; return chain; }),
      insert: vi.fn((payload: any) => { callLog.push({ kind: "insert", table, args: payload }); fx.onInsert?.(payload); return chain; }),
      upsert: vi.fn((payload: any, opts?: any) => { callLog.push({ kind: "upsert", table, args: { payload, opts } }); fx.onUpsert?.(payload); return chain; }),
      update: vi.fn((payload: any) => { callLog.push({ kind: "update", table, args: payload }); return chain; }),
      delete: vi.fn(() => { callLog.push({ kind: "delete", table }); return chain; }),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      like: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      or: vi.fn(() => chain),
      not: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      range: vi.fn(() => chain),
      match: vi.fn(() => chain),
      filter: vi.fn(() => chain),
      single: vi.fn(() => resolveSingle()),
      maybeSingle: vi.fn(() => resolveSingle()),
      throwOnError: vi.fn(() => chain),
      returns: vi.fn(() => chain),
      then: (onFulfilled: any, onRejected?: any) => resolve().then(onFulfilled, onRejected),
    };
    return chain;
  };

  const rpc = vi.fn((name: string, args?: any) => {
    callLog.push({ kind: "rpc", rpc: name, args });
    const fx = fixtures.rpc?.[name];
    if (fx?.impl) {
      try {
        const data = fx.impl(args);
        return Promise.resolve({ data, error: null });
      } catch (error) {
        return Promise.resolve({ data: null, error });
      }
    }
    return Promise.resolve({ data: fx?.data ?? null, error: fx?.error ?? null });
  });

  const client = {
    from: vi.fn((t: string) => makeBuilder(t)),
    rpc,
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: fixtures.user ?? null }, error: null })),
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: fixtures.user ? { user: fixtures.user, access_token: "test-token" } : null }, error: null }),
      ),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    },
    channel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}), unsubscribe: () => {} })),
    removeChannel: vi.fn(),
  };

  return { client, callLog, rpc };
}

export type MockedSupabase = ReturnType<typeof createSupabaseMock>;
