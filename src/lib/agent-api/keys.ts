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

// The key could not be checked (database unreachable or server misconfigured).
// Distinct from a wrong key, so a server fault is never reported as "invalid API key".
export class KeyCheckError extends Error {
  name = "KeyCheckError";
}

// Errors from the HTTP layer can quote header values, which include the service key.
// Never let a key reach a log line.
export function redactSecrets(message: string): string {
  return message
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_\-\s]*/g, "sb_$1_[redacted]")
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[redacted-jwt]")
    .replace(/bpcrm_[A-Za-z0-9_\-]+/g, "bpcrm_[redacted]");
}

// Returns the agent for a valid, unrevoked key, or null for a missing, malformed,
// unknown or revoked key. Throws KeyCheckError when the lookup itself fails.
export async function authenticateAgent(authorization: string | null): Promise<Agent | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  let result;
  try {
    result = await createAdminClient()
      .from("api_keys")
      .select("id, name, revoked_at")
      .eq("key_hash", sha256Hex(token))
      .maybeSingle();
  } catch (err) {
    throw new KeyCheckError(redactSecrets(err instanceof Error ? err.message : String(err)));
  }
  const { data, error } = result;
  if (error) throw new KeyCheckError(redactSecrets(error.message));
  if (!data || data.revoked_at) return null;
  const admin = createAdminClient();
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  return { keyId: data.id, name: data.name, actor: `agent:${slug}` };
}
