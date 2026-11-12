import "server-only";
import { env, SIGNING_LINK_DEFAULT_DAYS } from "@/lib/env";
import { generateAccessToken, hashAccessToken, sha256Hex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import type { OwnerContext } from "@/lib/owner";
import type { RequestContext } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "@/lib/time";
import {
  CANDIDATE_AGREEMENT_FULL_TEXT,
  CANDIDATE_TEMPLATE_VERSION,
  validateCandidateSubmission,
  type CandidateSigningAnswers,
} from "@/lib/candidate-agreement";
import { buildCandidateAgreementPdf } from "@/lib/documents/generated";
import { storeDocument } from "@/lib/documents/store";
import { signedUrlAfterIntegrityCheck } from "@/lib/documents/storage";

const TEMPLATE_SHA256 = sha256Hex(CANDIDATE_AGREEMENT_FULL_TEXT);
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const OPEN = ["created", "viewed"] as const;

export type CandidateAgreementRow = {
  id: string;
  candidate_id: string;
  status: string;
  expires_at: string;
  signed_at: string | null;
  signed_document_id: string | null;
};

// ---------------------------------------------------------------------------
// Owner side
// ---------------------------------------------------------------------------

export async function createCandidateAgreementLink(
  owner: OwnerContext,
  candidateId: string,
): Promise<{ ok: true; link: string; expiresAt: string } | { ok: false; error: string }> {
  const { data: candidate } = await owner.supabase.from("candidates").select("id").eq("id", candidateId).maybeSingle();
  if (!candidate) return { ok: false, error: "That candidate was not found." };

  const token = generateAccessToken();
  const expiresAt = addDays(new Date(), SIGNING_LINK_DEFAULT_DAYS);
  const { data: row, error } = await owner.supabase
    .from("candidate_agreements")
    .insert({
      candidate_id: candidateId,
      template_version: CANDIDATE_TEMPLATE_VERSION,
      template_sha256: TEMPLATE_SHA256,
      token_hash: hashAccessToken(token),
      expires_at: expiresAt.toISOString(),
      created_by: owner.profile.id,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: `The link could not be created. ${error?.message ?? ""}`.trim() };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "candidate_link_created",
    candidateId,
    detail: { agreement_id: row.id, expires_at: expiresAt.toISOString() },
  });
  return { ok: true, link: `${env.appBaseUrl}/sign/candidate/${token}`, expiresAt: expiresAt.toISOString() };
}

export async function revokeCandidateAgreementLink(owner: OwnerContext, agreementId: string): Promise<boolean> {
  const { data } = await owner.supabase
    .from("candidate_agreements")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", agreementId)
    .in("status", [...OPEN])
    .select("id, candidate_id")
    .maybeSingle();
  if (!data) return false;
  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "candidate_link_revoked",
    candidateId: data.candidate_id,
    detail: { agreement_id: agreementId },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Candidate side. Every call re-validates the token on the server.
// ---------------------------------------------------------------------------

export type CandidateProfileForSigning = {
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  current_title: string | null;
  linkedin_url: string | null;
};

export type CandidateLinkState =
  | { open: true; agreement: CandidateAgreementRow; candidate: CandidateProfileForSigning }
  | { open: false };

export async function resolveCandidateLink(token: string, ctx: RequestContext): Promise<CandidateLinkState> {
  if (!TOKEN_SHAPE.test(token)) return { open: false };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("candidate_agreements")
    .select("id, candidate_id, status, expires_at, signed_at, signed_document_id")
    .eq("token_hash", hashAccessToken(token))
    .maybeSingle<CandidateAgreementRow>();
  if (!row) return { open: false };

  const isOpen = (OPEN as readonly string[]).includes(row.status);
  if (row.status === "revoked" || row.status === "expired" || (isOpen && new Date(row.expires_at) <= new Date())) {
    if (isOpen) {
      await admin.from("candidate_agreements").update({ status: "expired" }).eq("id", row.id).in("status", [...OPEN]);
    }
    await writeAudit(admin, {
      actor: "client",
      action: "candidate_link_denied",
      candidateId: row.candidate_id,
      detail: { agreement_id: row.id, reason: row.status === "revoked" ? "revoked" : "expired" },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { open: false };
  }

  const { data: candidate } = await admin
    .from("candidates")
    .select("full_name, email, phone, city, state, current_title, linkedin_url")
    .eq("id", row.candidate_id)
    .single<CandidateProfileForSigning>();
  if (!candidate) return { open: false };
  return { open: true, agreement: row, candidate };
}

export async function recordCandidateView(row: CandidateAgreementRow, ctx: RequestContext): Promise<void> {
  if (row.status !== "created") return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("candidate_agreements")
    .update({ status: "viewed" })
    .eq("id", row.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();
  if (data) {
    await writeAudit(admin, {
      actor: "client",
      action: "candidate_page_viewed",
      candidateId: row.candidate_id,
      detail: { agreement_id: row.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }
}

export type SubmitResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function submitCandidateAgreement(
  token: string,
  raw: { answers: Record<string, string>; textOptIn: string; signatureName: string; consent: boolean },
  ctx: RequestContext,
): Promise<SubmitResult> {
  const link = await resolveCandidateLink(token, ctx);
  if (!link.open) return { ok: false, error: "This link is no longer active." };
  const { agreement } = link;
  if (!(OPEN as readonly string[]).includes(agreement.status)) {
    return { ok: false, error: "This agreement has already been signed." };
  }

  const checked = validateCandidateSubmission(raw);
  if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
  const { answers, textOptIn, signatureName } = checked.data;

  const admin = createAdminClient();
  const signedAt = new Date();
  const pdf = await buildCandidateAgreementPdf({
    agreementId: agreement.id,
    templateSha256: TEMPLATE_SHA256,
    answers,
    textOptIn,
    signatureName,
    signedAt,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const doc = await storeDocument({
    client: admin,
    candidateId: agreement.candidate_id,
    folder: "agreements",
    kind: "signed agreement",
    fileName: `Candidate Representation Agreement - ${answers.full_name} - ${signedAt.toISOString().slice(0, 10)}.pdf`,
    bytes: pdf,
    contentType: "application/pdf",
  });

  // Only one submission can win: the update matches while the link is open.
  const { data: updated } = await admin
    .from("candidate_agreements")
    .update({
      status: "signed",
      answers,
      signer_name: signatureName,
      text_opt_in: textOptIn,
      signed_at: signedAt.toISOString(),
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      signed_document_id: doc.id,
    })
    .eq("id", agreement.id)
    .in("status", [...OPEN])
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: false, error: "This agreement has already been signed." };

  await applyAnswersToCandidate(agreement.candidate_id, answers, textOptIn, signedAt);
  await writeAudit(admin, {
    actor: "client",
    action: "candidate_signed",
    candidateId: agreement.candidate_id,
    detail: { agreement_id: agreement.id, document_id: doc.id, sha256: doc.sha256, text_opt_in: textOptIn },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  return { ok: true };
}

// Copies what the candidate confirmed back onto their record, so the CRM
// always shows the details they signed with.
async function applyAnswersToCandidate(
  candidateId: string,
  answers: CandidateSigningAnswers,
  textOptIn: boolean,
  signedAt: Date,
) {
  const admin = createAdminClient();
  const { data: current } = await admin.from("candidates").select("status").eq("id", candidateId).single();
  const [city, ...rest] = answers.city_state.split(",");
  await admin
    .from("candidates")
    .update({
      full_name: answers.full_name,
      email: answers.email,
      phone: answers.phone,
      city: city?.trim() || null,
      state: rest.join(",").trim() || null,
      current_title: answers.current_title || null,
      linkedin_url: answers.linkedin_url || null,
      recent_submissions: answers.recent_submissions,
      text_opt_in: textOptIn,
      agreement_signed_at: signedAt.toISOString(),
      ...(current?.status === "new" || current?.status === "screening" ? { status: "active" } : {}),
    })
    .eq("id", candidateId);
}

export async function signedCopyUrl(token: string, ctx: RequestContext): Promise<string | null> {
  const link = await resolveCandidateLink(token, ctx);
  if (!link.open || link.agreement.status !== "signed" || !link.agreement.signed_document_id) return null;
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, storage_path, sha256, file_name")
    .eq("id", link.agreement.signed_document_id)
    .single();
  if (!doc) return null;
  const url = await signedUrlAfterIntegrityCheck(doc);
  await writeAudit(admin, {
    actor: "client",
    action: "candidate_copy_downloaded",
    candidateId: link.agreement.candidate_id,
    detail: { agreement_id: link.agreement.id, document_id: doc.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  return url;
}
