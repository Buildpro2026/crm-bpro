import { beforeEach, describe, expect, it, vi } from "vitest";

// Production 2026-11-18: every Chad request got 401 "invalid API key" while Supabase
// logged no key lookup at all. A failed lookup must surface as a server fault, not
// as a wrong key.
// A plain stub (not vi.fn) so an implementation that throws is a database fault under test,
// not a failure Vitest attributes to the mock.
let impl: () => Promise<unknown> = async () => ({ data: null, error: null });
let calls = 0;
const lookup = {
  mockResolvedValue(v: unknown) { impl = async () => v; },
  mockImplementation(f: () => Promise<unknown>) { impl = f; },
  mockReset() { impl = async () => ({ data: null, error: null }); calls = 0; },
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => { calls += 1; return impl(); } }) }),
      update: () => ({ eq: async () => ({}) }),
    }),
  }),
}));

const { authenticateAgent, KeyCheckError, generateApiKey } = await import("@/lib/agent-api/keys");
const header = () => `Bearer ${generateApiKey().key}`;

describe("agent key check", () => {
  beforeEach(() => lookup.mockReset());

  it("throws KeyCheckError when the database returns an error", async () => {
    lookup.mockResolvedValue({ data: null, error: { message: "Invalid API key" } });
    await expect(authenticateAgent(header())).rejects.toBeInstanceOf(KeyCheckError);
  });

  it("throws KeyCheckError when the client itself fails", async () => {
    lookup.mockImplementation(() => Promise.reject(new Error("fetch failed")));
    const err = await authenticateAgent(header()).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(KeyCheckError);
    expect((err as Error).message).toBe("fetch failed");
  });

  it("returns null for an unknown or revoked key", async () => {
    lookup.mockResolvedValue({ data: null, error: null });
    expect(await authenticateAgent(header())).toBeNull();
    lookup.mockResolvedValue({ data: { id: "1", name: "x", revoked_at: "2026-11-16" }, error: null });
    expect(await authenticateAgent(header())).toBeNull();
  });

  it("returns the agent for a valid key", async () => {
    lookup.mockResolvedValue({ data: { id: "1", name: "CRM_API_KEY", revoked_at: null }, error: null });
    expect(await authenticateAgent(header())).toEqual({ keyId: "1", name: "CRM_API_KEY", actor: "agent:crm-api-key" });
  });

  it("never touches the database for a malformed header", async () => {
    expect(await authenticateAgent("Bearer bpcrm_short")).toBeNull();
    expect(calls).toBe(0);
  });
});
