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
