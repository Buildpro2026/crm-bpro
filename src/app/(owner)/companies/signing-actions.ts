"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/owner";
import { getRequestContext } from "@/lib/request-context";
import { isUuid } from "@/lib/records";
import { buildSigningEmail } from "@/lib/signing/email-text";
import {
  countersignSigningRequest,
  createSigningRequest,
  revokeSigningRequest,
  type ActionResult,
} from "@/lib/signing/service";

export type CreateSignatureRequestResult =
  | { ok: true; requestId: string; link: string; expiresAt: string; emailText: string }
  | { ok: false; error: string };

export async function createSignatureRequestAction(
  companyId: string,
  contactId: string,
): Promise<CreateSignatureRequestResult> {
  const owner = await requireOwner();
  if (!isUuid(companyId) || !isUuid(contactId)) {
    return { ok: false, error: "Choose a contact for this company." };
  }

  const [{ data: company }, { data: contact }] = await Promise.all([
    owner.supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    owner.supabase.from("contacts").select("name").eq("id", contactId).eq("company_id", companyId).maybeSingle(),
  ]);
  if (!company || !contact) return { ok: false, error: "Choose a contact for this company." };

  const result = await createSigningRequest(owner, companyId, contactId);
  if (!result.ok) return result;

  revalidatePath(`/companies/${companyId}`);
  return {
    ok: true,
    requestId: result.created.requestId,
    link: result.created.link,
    expiresAt: result.created.expiresAt,
    emailText: buildSigningEmail({
      contactName: contact.name,
      companyName: company.name,
      link: result.created.link,
      expiresAt: result.created.expiresAt,
    }),
  };
}

export async function revokeSignatureRequestAction(requestId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!isUuid(requestId)) return { ok: false, error: "That request was not found." };
  const result = await revokeSigningRequest(owner, requestId);
  revalidatePath("/companies", "layout");
  return result;
}

export async function countersignSignatureRequestAction(requestId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!isUuid(requestId)) return { ok: false, error: "That request was not found." };
  const ctx = await getRequestContext();
  const result = await countersignSigningRequest(owner, requestId, ctx);
  revalidatePath("/companies", "layout");
  return result;
}
