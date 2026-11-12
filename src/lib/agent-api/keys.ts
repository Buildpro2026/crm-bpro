import "server-only";
import { randomBytes } from "node:crypto";
import { sha256Hex } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Agent API keys look like "bpcrm_" + 43 base64url characters (256 bits).
// Only the SHA-256 hash is stored; the key itself is shown to Lee once.
export const KEY_PREFIX = "bpcrm_";
const KEY_SHAPE = /^bpcrm_[A-Za-z0-9_-]{43}$/;

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: sha256Hex(key) };
}

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match || !KEY_SHAPE.test(match[1])) return null;
  return match[1];
}

export type Agent = { keyId: string; name: string; actor: string };

// Returns the agent for a valid, unrevoked key, or null.
export async function authenticateAgent(authorization: string | null): Promise<Agent | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("api_keys")
    .select("id, name, revoked_at")
    .eq("key_hash", sha256Hex(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  return { keyId: data.id, name: data.name, actor: `agent:${slug}` };
}
