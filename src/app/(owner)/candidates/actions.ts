"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";
import { readStrings, type FormState } from "@/lib/form-state";
import { isUuid } from "@/lib/records";
import { CANDIDATE_FIELD_NAMES, validateCandidateInput } from "@/lib/candidates";
import { createCandidateAgreementLink, revokeCandidateAgreementLink } from "@/lib/candidates/agreement-service";
import { formatCentralDateTime } from "@/lib/time";

export async function createCandidateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const values = readStrings(formData, CANDIDATE_FIELD_NAMES);
  const result = validateCandidateInput(values);
  if (!result.ok) return { error: "Please fix the highlighted fields.", fieldErrors: result.errors, values };

  const { data, error } = await owner.supabase
    .from("candidates")
    .insert({ ...result.data, created_by: owner.profile.id })
    .select("id")
    .single();
  if (error || !data) return { error: `The candidate could not be saved. ${error?.message ?? ""}`.trim(), values };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "candidate_created",
    candidateId: data.id,
    detail: { name: result.data.full_name },
  });
  revalidatePath("/candidates");
  redirect(`/candidates/${data.id}`);
}

export async function updateCandidateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { error: "That candidate was not found." };
  const values = readStrings(formData, CANDIDATE_FIELD_NAMES);
  const result = validateCandidateInput(values);
  if (!result.ok) return { error: "Please fix the highlighted fields.", fieldErrors: result.errors, values };

  const { data, error } = await owner.supabase.from("candidates").update(result.data).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "The candidate could not be saved. Refresh and try again.", values };

  await writeAudit(owner.supabase, { actor: owner.actor, action: "candidate_updated", candidateId: id, detail: {} });
  revalidatePath(`/candidates/${id}`);
  redirect(`/candidates/${id}`);
}

export type CandidateLinkResult =
  | { ok: true; link: string; expiresAt: string; emailText: string }
  | { ok: false; error: string };

export async function createCandidateLinkAction(candidateId: string): Promise<CandidateLinkResult> {
  const owner = await requireOwner();
  if (!isUuid(candidateId)) return { ok: false, error: "That candidate was not found." };
  const { data: candidate } = await owner.supabase.from("candidates").select("full_name").eq("id", candidateId).maybeSingle();
  if (!candidate) return { ok: false, error: "That candidate was not found." };

  const created = await createCandidateAgreementLink(owner, candidateId);
  if (!created.ok) return created;
  revalidatePath(`/candidates/${candidateId}`);

  const firstName = candidate.full_name.split(" ")[0];
  const emailText = [
    `Subject: Your BuildPro Recruiters candidate agreement`,
    ``,
    `Hi ${firstName},`,
    ``,
    `Thank you for working with BuildPro Recruiters. Before we present you to any employer, please review and sign our short Candidate Representation Agreement online. It takes about five minutes, and most of your details are already filled in:`,
    ``,
    created.link,
    ``,
    `There is never a fee to you for our services, and we will never submit you to an employer without your approval. The link is good until ${formatCentralDateTime(created.expiresAt)} (Central Time).`,
    ``,
    `Questions? Call or text me at 214-238-5145.`,
    ``,
    `Best regards,`,
    `Lee Chandler`,
    `BuildPro Recruiters | 214-238-5145 | buildprorecruiters.com`,
  ].join("\n");

  return { ok: true, link: created.link, expiresAt: created.expiresAt, emailText };
}

export async function revokeCandidateLinkAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const candidateId = String(formData.get("candidate_id") ?? "");
  if (!isUuid(id)) return;
  await revokeCandidateAgreementLink(owner, id);
  if (isUuid(candidateId)) revalidatePath(`/candidates/${candidateId}`);
}
