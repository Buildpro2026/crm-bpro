"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";
import { generateApiKey } from "@/lib/agent-api/keys";
import { isUuid } from "@/lib/records";

export type CreateKeyResult = { ok: true; key: string; name: string } | { ok: false; error: string };

export async function createApiKeyAction(name: string): Promise<CreateKeyResult> {
  const owner = await requireOwner();
  const clean = name.trim();
  if (!clean || clean.length > 100) return { ok: false, error: "Give the key a name, such as Chad." };
  const { key, prefix, hash } = generateApiKey();
  const { data, error } = await owner.supabase
    .from("api_keys")
    .insert({ name: clean, key_prefix: prefix, key_hash: hash, created_by: owner.profile.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `The key could not be created. ${error?.message ?? ""}`.trim() };
  await writeAudit(owner.supabase, { actor: owner.actor, action: "api_key_created", detail: { key_id: data.id, name: clean, prefix } });
  revalidatePath("/settings/api-keys");
  return { ok: true, key, name: clean };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const { data } = await owner.supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id, name")
    .maybeSingle();
  if (data) {
    await writeAudit(owner.supabase, { actor: owner.actor, action: "api_key_revoked", detail: { key_id: id, name: data.name } });
  }
  revalidatePath("/settings/api-keys");
}
