import { describe, expect, it } from "vitest";
import { bearerToken, generateApiKey } from "@/lib/agent-api/keys";
import { routeAgentRequest } from "@/lib/agent-api/handlers";
import { sha256Hex } from "@/lib/crypto";

// A database stub that fails the test if any query is attempted.
const noDb = new Proxy({}, { get: () => { throw new Error("database should not be touched"); } }) as never;
const agent = { keyId: "k", name: "Chad", actor: "agent:chad" };
const ctx = (body: Record<string, unknown> = {}) => ({ db: noDb, agent, query: new URLSearchParams(), body });

describe("agent API keys", () => {
  it("generates keys that parse back and hash consistently", () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^bpcrm_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(sha256Hex(key));
    expect(bearerToken(`Bearer ${key}`)).toBe(key);
    expect(bearerToken(`bearer   ${key}`)).toBe(key);
  });

  it("rejects missing or malformed authorization headers", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer bpcrm_short")).toBeNull();
    expect(bearerToken("Bearer pat-na1-abc123")).toBeNull(); // a HubSpot token is not a CRM key
  });
});

describe("agent API routing", () => {
  it("answers health without touching the database", async () => {
    expect(await routeAgentRequest("GET", ["health"], ctx())).toEqual({ status: 200, body: { ok: true, agent: "Chad" } });
  });

  it("returns 404 for unknown paths, bad ids, deletes, and deep paths", async () => {
    for (const [method, path] of [
      ["GET", ["nope"]],
      ["GET", ["candidates", "not-a-uuid"]],
      ["DELETE", ["candidates", "11111111-1111-4111-8111-111111111111"]],
      ["GET", ["candidates", "11111111-1111-4111-8111-111111111111", "extra"]],
    ] as const) {
      expect((await routeAgentRequest(method, [...path], ctx())).status, `${method} ${path.join("/")}`).toBe(404);
    }
  });

  it("validates before writing", async () => {
    expect((await routeAgentRequest("POST", ["candidates"], ctx({ email: "x@example.com" }))).status).toBe(422);
    expect((await routeAgentRequest("POST", ["notes"], ctx({ body: "hello" }))).status).toBe(422);
    expect((await routeAgentRequest("POST", ["notes"], ctx({ body: " ", candidate_id: "11111111-1111-4111-8111-111111111111" }))).status).toBe(422);
    expect((await routeAgentRequest("POST", ["tasks"], ctx({ title: "" }))).status).toBe(422);
    expect((await routeAgentRequest("GET", ["people"], ctx())).status).toBe(400);
  });
});

describe("agent API query checks", () => {
  it("rejects a bad since date before querying", async () => {
    const c = { ...ctx(), query: new URLSearchParams("since=not-a-date") };
    // since is checked after the query is built, so give it a chainable stub that records nothing.
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "or", "eq", "gte"]) chain[m] = () => chain;
    const db = { from: () => chain } as never;
    expect((await routeAgentRequest("GET", ["candidates"], { ...c, db })).status).toBe(400);
    expect((await routeAgentRequest("GET", ["contacts"], { ...c, db })).status).toBe(400);
  });
});

// A fake Supabase client: records every call and answers from canned rows per table.
type Call = { table: string; op: string; args: unknown[] };
function fakeDb(rows: Record<string, Record<string, unknown>[]>, calls: Call[] = []) {
  const from = (table: string) => {
    let result: Record<string, unknown>[] = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    const rec = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
    for (const op of ["select", "order", "limit", "ilike", "not", "eq", "or", "gte"]) chain[op] = rec(op);
    chain.insert = (row: Record<string, unknown>) => {
      calls.push({ table, op: "insert", args: [row] });
      result = [{ id: "22222222-2222-4222-8222-222222222222", ...row }];
      return chain;
    };
    chain.maybeSingle = async () => ({ data: result[0] ?? null });
    chain.single = async () => ({ data: result[0] ?? null, error: null });
    chain.then = (res: (v: unknown) => unknown) => res({ data: result, error: null });
    return chain;
  };
  return { from } as never;
}

const CO = "11111111-1111-4111-8111-111111111111";
const OTHER_CO = "33333333-3333-4333-8333-333333333333";
const CONTACT = "44444444-4444-4444-8444-444444444444";

describe("agent API deals", () => {
  it("creates a deal, audits it as the agent, and reports created", async () => {
    const calls: Call[] = [];
    const db = fakeDb({ companies: [{ id: CO }], deals: [] }, calls);
    const r = await routeAgentRequest("POST", ["deals"], { ...ctx({ name: "Hanover EA search", company_id: CO, stage: "agreement sent", fee_percent: "20" }), db });
    expect(r.status).toBe(201);
    expect((r.body as { created: boolean }).created).toBe(true);
    const insert = calls.find((c) => c.table === "deals" && c.op === "insert");
    expect(insert?.args[0]).toMatchObject({ name: "Hanover EA search", company_id: CO, stage: "agreement sent", fee_percent: 20 });
    const audit = calls.find((c) => c.table === "audit_log" && c.op === "insert");
    expect(audit?.args[0]).toMatchObject({ actor: "agent:chad", action: "deal_created" });
  });

  it("returns the open deal with the same name instead of a duplicate", async () => {
    const calls: Call[] = [];
    const db = fakeDb({ companies: [{ id: CO }], deals: [{ id: "d1", name: "Hanover EA search", company_id: CO, stage: "contacted" }] }, calls);
    const r = await routeAgentRequest("POST", ["deals"], { ...ctx({ name: "hanover ea search", company_id: CO }), db });
    expect(r.status).toBe(200);
    expect((r.body as { created: boolean }).created).toBe(false);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("rejects a bad deal, an unknown company and a contact from another company before inserting", async () => {
    expect((await routeAgentRequest("POST", ["deals"], ctx({ name: "x" }))).status).toBe(422);
    expect((await routeAgentRequest("POST", ["deals"], ctx({ name: "x", company_id: CO, fee_percent: "150" }))).status).toBe(422);
    const calls: Call[] = [];
    const none = fakeDb({ companies: [] }, calls);
    expect((await routeAgentRequest("POST", ["deals"], { ...ctx({ name: "x", company_id: CO }), db: none })).status).toBe(422);
    const elsewhere = fakeDb({ companies: [{ id: CO }], contacts: [{ id: CONTACT, company_id: OTHER_CO }] }, calls);
    expect((await routeAgentRequest("POST", ["deals"], { ...ctx({ name: "x", company_id: CO, contact_id: CONTACT }), db: elsewhere })).status).toBe(422);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });
});

describe("agent API agreements", () => {
  it("lists agreements without secret columns", async () => {
    const calls: Call[] = [];
    const db = fakeDb({ signature_requests: [{ id: "a1", status: "client signed" }] }, calls);
    const r = await routeAgentRequest("GET", ["agreements"], { ...ctx(), query: new URLSearchParams("status=client signed"), db });
    expect(r.status).toBe(200);
    const cols = String(calls.find((c) => c.op === "select")?.args[0]);
    for (const secret of ["token_hash", "ip_address", "user_agent", "signature_storage_path", "form_answers", "signer_email", "*"]) {
      expect(cols).not.toContain(secret);
    }
  });

  it("rejects a bad status or company id, and has no way to create, change or send one", async () => {
    expect((await routeAgentRequest("GET", ["agreements"], { ...ctx(), query: new URLSearchParams("status=signed") })).status).toBe(400);
    expect((await routeAgentRequest("GET", ["agreements"], { ...ctx(), query: new URLSearchParams("company_id=nope") })).status).toBe(400);
    const id = "55555555-5555-4555-8555-555555555555";
    for (const [method, path] of [["POST", ["agreements"]], ["PATCH", ["agreements", id]], ["DELETE", ["agreements", id]]] as const) {
      expect((await routeAgentRequest(method, [...path], ctx())).status, `${method} ${path.join("/")}`).toBe(404);
    }
  });
});
