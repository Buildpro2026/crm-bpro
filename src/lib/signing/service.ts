import "server-only";
import { env, SIGNING_LINK_DEFAULT_DAYS } from "@/lib/env";
import { generateAccessToken, hashAccessToken, randomSuffix, sha256Hex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import type { RequestContext } from "@/lib/request-context";
import type { OwnerContext } from "@/lib/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "@/lib/time";
import {
  TEMPLATE_KEY,
  TEMPLATE_VERSION,
  AGREEMENT_FULL_TEXT,
} from "@/lib/agreement";
import {
  INTAKE_FORM_VERSION,
  INTAKE_FORM_KEY,
  validateIntakeAnswers,
  isEmail,
  type IntakeAnswers,
} from "@/lib/intake-form";
import { buildSigningPacket, type SignatureInput } from "@/lib/documents/packet";
import { downloadPrivateFile, uploadPrivateFile } from "@/lib/documents/storage";

export type RequestRow = {
  id: string;
  company_id: string;
  contact_id: string;
  status: string;
  template_version: string;
  template_sha256: string;
  intake_form_version: string;
  expires_at: string;
  form_answers: IntakeAnswers | null;
  form_submitted_at: string | null;
  client_signed_at: string | null;
  client_signed_document_id: string | null;
  executed_document_id: string | null;
  signature_method: "drawn" | "typed" | null;
  signature_storage_path: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signer_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  countersigned_at: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const OPEN_FOR_CLIENT = ["created", "viewed"] as const;
const MAX_SIGNATURE_BYTES = 400_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

const CLOSED_MESSAGE = "This link is no longer active.";

// ---------------------------------------------------------------------------
// Owner side
// ---------------------------------------------------------------------------

export type CreatedRequest = {
  requestId: string;
  link: string;
  expiresAt: string;
};

// Creates a signing packet request and the one-time link. The raw token is
// returned here and nowhere else; only its hash is stored.
export async function createSigningRequest(
  owner: OwnerContext,
  companyId: string,
  contactId: string,
): Promise<{ ok: true; created: CreatedRequest } | { ok: false; error: string }> {
  const { data: contact } = await owner.supabase
    .from("contacts")
    .select("id, company_id")
    .eq("id", contactId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Choose a contact that belongs to this company." };

  const token = generateAccessToken();
  const expiresAt = addDays(new Date(), SIGNING_LINK_DEFAULT_DAYS);

  const { data: row, error } = await owner.supabase
    .from("signature_requests")
    .insert({
      company_id: companyId,
      contact_id: contactId,
      template_key: TEMPLATE_KEY,
      template_version: TEMPLATE_VERSION,
      template_sha256: TEMPLATE_SHA256,
      intake_form_key: INTAKE_FORM_KEY,
      intake_form_version: INTAKE_FORM_VERSION,
      token_hash: hashAccessToken(token),
      status: "created",
      expires_at: expiresAt.toISOString(),
      created_by: owner.profile.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    return { ok: false, error: `Could not create the signing request. ${error?.message ?? ""}`.trim() };
  }

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "link_created",
    companyId,
    signatureRequestId: row.id,
    detail: {
      contact_id: contactId,
      expires_at: expiresAt.toISOString(),
      template_version: TEMPLATE_VERSION,
      intake_form_version: INTAKE_FORM_VERSION,
    },
  });

  return {
    ok: true,
    created: {
      requestId: row.id,
      link: `${env.appBaseUrl}/sign/${token}`,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function revokeSigningRequest(
  owner: OwnerContext,
  requestId: string,
): Promise<ActionResult> {
  const { data: row } = await owner.supabase
    .from("signature_requests")
    .select("id, company_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!row) return { ok: false, error: "That signing request was not found." };
  if (row.status === "fully executed" || row.status === "revoked") {
    return { ok: false, error: `This request is already ${row.status}.` };
  }

  const { data: updated, error } = await owner.supabase
    .from("signature_requests")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", requestId)
    .neq("status", "fully executed")
    .neq("status", "revoked")
    .select("id")
    .maybeSingle();
  if (error || !updated) return { ok: false, error: "The request could not be revoked. Refresh and try again." };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "link_revoked",
    companyId: row.company_id,
    signatureRequestId: requestId,
    detail: { previous_status: row.status },
  });
  return { ok: true };
}

// Lee countersigns. Owner RLS applies to every table read or written here.
// Storage reads use the service role, after the owner check above.
export async function countersignSigningRequest(
  owner: OwnerContext,
  requestId: string,
  ctx: RequestContext,
): Promise<ActionResult> {
  const supabase = owner.supabase;
  const { data: row } = await supabase
    .from("signature_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<RequestRow>();
  if (!row) return { ok: false, error: "That signing request was not found." };
  if (row.status !== "client signed" || !row.client_signed_at || !row.client_signed_document_id) {
    return { ok: false, error: "Only a request the client has signed can be countersigned." };
  }

  const [{ data: company }, { data: contact }, { data: clientDoc }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", row.company_id).single(),
    supabase.from("contacts").select("id, name").eq("id", row.contact_id).single(),
    supabase.from("documents").select("sha256").eq("id", row.client_signed_document_id).single(),
  ]);
  if (!company || !contact || !clientDoc) {
    return { ok: false, error: "The request is missing its company, contact or client-signed copy." };
  }

  const signature = await loadSignature(row);
  const countersignedAt = new Date();
  const signedAt = new Date(row.client_signed_at);

  const { bytes, contentSha256 } = await buildSigningPacket({
    variant: "executed",
    requestId: row.id,
    companyName: company.name,
    templateVersion: row.template_version,
    templateSha256: row.template_sha256,
    intakeFormVersion: row.intake_form_version,
    answers: row.form_answers ?? {},
    signer: {
      name: row.signer_name ?? "",
      title: row.signer_title ?? "",
      email: row.signer_email ?? "",
      signedAt,
      method: row.signature_method ?? "typed",
      signature,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    },
    countersign: {
      name: owner.profile.full_name,
      title: owner.profile.title ?? "Owner",
      signedAt: countersignedAt,
    },
    clientSignedSha256: clientDoc.sha256,
    generatedAt: countersignedAt,
  });

  const pdfSha = sha256Hex(bytes);
  const path = `companies/${row.company_id}/signature-requests/${row.id}/executed-${randomSuffix()}.pdf`;
  await uploadPrivateFile(path, bytes, "application/pdf");

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      company_id: row.company_id,
      kind: "executed agreement",
      file_name: fileNameFor("Executed", company.name, row.id),
      storage_path: path,
      sha256: pdfSha,
      size_bytes: bytes.byteLength,
      mime_type: "application/pdf",
      signature_request_id: row.id,
      created_by: owner.profile.id,
    })
    .select("id")
    .single();
  if (docError || !doc) return { ok: false, error: `Could not record the executed PDF. ${docError?.message ?? ""}`.trim() };

  const { data: updated, error } = await supabase
    .from("signature_requests")
    .update({
      status: "fully executed",
      countersigned_at: countersignedAt.toISOString(),
      countersigned_by: owner.profile.id,
      executed_document_id: doc.id,
    })
    .eq("id", row.id)
    .eq("status", "client signed")
    .select("id")
    .maybeSingle();
  if (error || !updated) return { ok: false, error: "The request changed while countersigning. Refresh and check its status." };

  await writeAudit(supabase, {
    actor: owner.actor,
    action: "countersigned",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { countersigned_by: owner.profile.full_name, contact_id: contact.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  await writeAudit(supabase, {
    actor: owner.actor,
    action: "pdf_generated",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { kind: "executed", document_id: doc.id, sha256: pdfSha, content_sha256: contentSha256 },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Client side. Every call re-validates the token on the server.
// ---------------------------------------------------------------------------

export type LinkState =
  | {
      open: true;
      request: RequestRow;
      companyName: string;
      contactName: string;
      contactEmail: string | null;
      prefill: Record<string, string>;
    }
  | { open: false; reason: "not_found" | "revoked" | "expired" };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export async function resolveSigningLink(token: string, ctx: RequestContext): Promise<LinkState> {
  if (!TOKEN_SHAPE.test(token)) return { open: false, reason: "not_found" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("signature_requests")
    .select("*")
    .eq("token_hash", hashAccessToken(token))
    .maybeSingle<RequestRow>();
  if (!row) return { open: false, reason: "not_found" };

  if (row.status === "revoked") {
    await denyAccess(row, "revoked", ctx);
    return { open: false, reason: "revoked" };
  }

  if (OPEN_FOR_CLIENT.includes(row.status as (typeof OPEN_FOR_CLIENT)[number]) && new Date(row.expires_at) <= new Date()) {
    // Record the expiry once: the update only matches while still open.
    const { data: flipped } = await admin
      .from("signature_requests")
      .update({ status: "expired" })
      .eq("id", row.id)
      .in("status", [...OPEN_FOR_CLIENT])
      .select("id")
      .maybeSingle();
    if (flipped) {
      await writeAudit(admin, {
        actor: "client",
        action: "link_expired",
        companyId: row.company_id,
        signatureRequestId: row.id,
        detail: { expires_at: row.expires_at },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
    return { open: false, reason: "expired" };
  }

  if (row.status === "expired") {
    await denyAccess(row, "expired", ctx);
    return { open: false, reason: "expired" };
  }

  const [{ data: company }, { data: contact }, { data: deal }] = await Promise.all([
    admin.from("companies").select("*").eq("id", row.company_id).single(),
    admin.from("contacts").select("*").eq("id", row.contact_id).single(),
    // The company's most recently updated open deal, if deals exist yet.
    admin
      .from("deals")
      .select("position_title, positions_count")
      .eq("company_id", row.company_id)
      .not("stage", "in", "(won,lost)")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    open: true,
    request: row,
    companyName: company?.name ?? "",
    contactName: contact?.name ?? "",
    contactEmail: contact?.email ?? null,
    prefill: buildIntakePrefill(company, contact, deal),
  };
}

type Row = Record<string, unknown> | null | undefined;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// Maps what BuildPro already knows onto the Client Search Information Form,
// so the client only confirms it instead of typing it again.
export function buildIntakePrefill(company: Row, contact: Row, deal: Row): Record<string, string> {
  const out: Record<string, string> = {
    company_name: str(company?.name),
    industry: str(company?.industry),
    company_website: str(company?.website),
    hq_city_state: [str(company?.hq_city), str(company?.hq_state)].filter(Boolean).join(", "),
    contact_name: str(contact?.name),
    contact_title: str(contact?.title),
    contact_email: str(contact?.email),
    contact_phone: str(contact?.phone),
    position_title: str(deal?.position_title),
    number_of_openings: str(deal?.positions_count),
  };
  for (const key of Object.keys(out)) if (!out[key]) delete out[key];
  return out;
}

async function denyAccess(row: RequestRow, reason: "revoked" | "expired", ctx: RequestContext) {
  await writeAudit(createAdminClient(), {
    actor: "client",
    action: "link_access_denied",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { reason },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function recordPageView(row: RequestRow, ctx: RequestContext): Promise<void> {
  const admin = createAdminClient();
  if (row.status === "created") {
    await admin
      .from("signature_requests")
      .update({ status: "viewed" })
      .eq("id", row.id)
      .eq("status", "created");
  }
  await writeAudit(admin, {
    actor: "client",
    action: "page_viewed",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { status_at_view: row.status },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

// Saves the Client Search Information Form. Validation runs here, on the
// server, whatever the browser checked.
export async function saveIntakeForm(
  token: string,
  rawAnswers: Record<string, unknown>,
  ctx: RequestContext,
): Promise<ActionResult & { answers?: IntakeAnswers }> {
  const link = await resolveSigningLink(token, ctx);
  if (!link.open) return { ok: false, error: CLOSED_MESSAGE };

  const { answers, errors } = validateIntakeAnswers(rawAnswers);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Please complete every field.", fieldErrors: errors };
  }

  const admin = createAdminClient();
  const row = link.request;
  const submittedAt = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("signature_requests")
    .update({ form_answers: answers, form_submitted_at: submittedAt })
    .eq("id", row.id)
    .in("status", [...OPEN_FOR_CLIENT])
    .is("client_signed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { ok: false, error: CLOSED_MESSAGE };

  await writeAudit(admin, {
    actor: "client",
    action: "form_submitted",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { fields: Object.keys(answers).length, submitted_at: submittedAt },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  return { ok: true, answers };
}

export type SignatureSubmission = {
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  consent: boolean;
  method: "drawn" | "typed";
  drawnPngDataUrl?: string;
  typedName?: string;
};

// Client signs. Produces the client-signed PDF, stores it, and marks the
// request client signed. The status change happens last among the writes
// that matter, and only if the request is still open.
export async function submitClientSignature(
  token: string,
  input: SignatureSubmission,
  ctx: RequestContext,
): Promise<ActionResult> {
  const link = await resolveSigningLink(token, ctx);
  if (!link.open) return { ok: false, error: CLOSED_MESSAGE };
  const row = link.request;

  const fieldErrors: Record<string, string> = {};
  const signerName = (input.signerName ?? "").trim();
  const signerTitle = (input.signerTitle ?? "").trim();
  const signerEmail = (input.signerEmail ?? "").trim();
  if (signerName.length < 2 || signerName.length > 200) fieldErrors.signerName = "Enter the printed name of the signer.";
  if (signerTitle.length < 2 || signerTitle.length > 200) fieldErrors.signerTitle = "Enter the signer's title.";
  if (!isEmail(signerEmail)) fieldErrors.signerEmail = "Enter a valid email address for the signer.";
  if (input.consent !== true) fieldErrors.consent = "You must check the consent box to sign.";
  if (!row.form_submitted_at || !row.form_answers) {
    return { ok: false, error: "Complete the Client Search Information Form before signing." };
  }

  let signature: SignatureInput | null = null;
  if (input.method === "drawn") {
    try {
      signature = { kind: "drawn", png: decodeDrawnSignature(input.drawnPngDataUrl ?? "") };
    } catch (err) {
      fieldErrors.signature = err instanceof Error ? err.message : "Draw your signature before submitting.";
    }
  } else {
    const text = (input.typedName ?? "").trim();
    if (text.length < 2 || text.length > 120) {
      fieldErrors.typedName = "Type your signature.";
    } else {
      signature = { kind: "typed", text };
    }
  }
  if (Object.keys(fieldErrors).length > 0 || signature === null) {
    return { ok: false, error: "Please fix the highlighted items.", fieldErrors };
  }

  const admin = createAdminClient();
  const signedAt = new Date();
  const suffix = randomSuffix();

  const { data: company } = await admin.from("companies").select("name").eq("id", row.company_id).single();
  if (!company) return { ok: false, error: "This request is missing its company record." };

  let signaturePath: string | null = null;
  if (signature.kind === "drawn") {
    signaturePath = `companies/${row.company_id}/signature-requests/${row.id}/signature-${suffix}.png`;
    await uploadPrivateFile(signaturePath, signature.png, "image/png");
  }

  const { bytes } = await buildSigningPacket({
    variant: "client_signed",
    requestId: row.id,
    companyName: company.name,
    templateVersion: row.template_version,
    templateSha256: row.template_sha256,
    intakeFormVersion: row.intake_form_version,
    answers: row.form_answers,
    signer: {
      name: signerName,
      title: signerTitle,
      email: signerEmail,
      signedAt,
      method: input.method,
      signature,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
    countersign: null,
    clientSignedSha256: null,
    generatedAt: signedAt,
  });
  const pdfSha = sha256Hex(bytes);
  const pdfPath = `companies/${row.company_id}/signature-requests/${row.id}/client-signed-${suffix}.pdf`;
  await uploadPrivateFile(pdfPath, bytes, "application/pdf");

  const { data: doc, error: docError } = await admin
    .from("documents")
    .insert({
      company_id: row.company_id,
      kind: "other",
      file_name: fileNameFor("Client Signed", company.name, row.id),
      storage_path: pdfPath,
      sha256: pdfSha,
      size_bytes: bytes.byteLength,
      mime_type: "application/pdf",
      signature_request_id: row.id,
    })
    .select("id")
    .single();
  if (docError || !doc) return { ok: false, error: "The signed PDF could not be saved. Try again." };

  const { data: updated, error } = await admin
    .from("signature_requests")
    .update({
      status: "client signed",
      signer_name: signerName,
      signer_title: signerTitle,
      signer_email: signerEmail,
      signature_method: input.method,
      signature_storage_path: signaturePath,
      client_signed_at: signedAt.toISOString(),
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      client_signed_document_id: doc.id,
    })
    .eq("id", row.id)
    .in("status", [...OPEN_FOR_CLIENT])
    .is("client_signed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { ok: false, error: CLOSED_MESSAGE };

  await writeAudit(admin, {
    actor: "client",
    action: "client_signed",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { method: input.method, signer_email: signerEmail, signed_at: signedAt.toISOString() },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
  await writeAudit(admin, {
    actor: "system",
    action: "pdf_generated",
    companyId: row.company_id,
    signatureRequestId: row.id,
    detail: { kind: "client_signed", document_id: doc.id, sha256: pdfSha },
  });
  return { ok: true };
}

// The executed copy is available to the client through the same link, once
// Lee has countersigned. The link is not valid for anything else after that.
export async function executedCopyForClient(
  token: string,
  ctx: RequestContext,
): Promise<{ ok: true; document: { storage_path: string; sha256: string; file_name: string; id: string; company_id: string; signature_request_id: string } } | { ok: false }> {
  const link = await resolveSigningLink(token, ctx).catch(() => null);
  if (!link || !link.open || link.request.status !== "fully executed" || !link.request.executed_document_id) {
    return { ok: false };
  }
  const { data: doc } = await createAdminClient()
    .from("documents")
    .select("id, company_id, signature_request_id, storage_path, sha256, file_name")
    .eq("id", link.request.executed_document_id)
    .single();
  if (!doc) return { ok: false };
  return { ok: true, document: doc };
}

export async function recordExecutedDownload(
  doc: { id: string; company_id: string; signature_request_id: string },
  ctx: RequestContext,
): Promise<void> {
  await writeAudit(createAdminClient(), {
    actor: "client",
    action: "executed_copy_downloaded",
    companyId: doc.company_id,
    signatureRequestId: doc.signature_request_id,
    detail: { document_id: doc.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMPLATE_SHA256 = sha256Hex(AGREEMENT_FULL_TEXT);

export function decodeDrawnSignature(dataUrl: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Draw your signature before submitting.");
  const bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
  if (bytes.length < 200) throw new Error("Draw your signature before submitting.");
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new Error("The signature image is too large. Try a simpler drawing.");
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new Error("The signature image is not a valid PNG.");
  return new Uint8Array(bytes);
}

async function loadSignature(row: RequestRow): Promise<SignatureInput> {
  if (row.signature_method === "drawn" && row.signature_storage_path) {
    return { kind: "drawn", png: await downloadPrivateFile(row.signature_storage_path) };
  }
  return { kind: "typed", text: row.signer_name ?? "" };
}

function fileNameFor(kind: string, companyName: string, requestId: string): string {
  const safe = companyName.replace(/[^A-Za-z0-9 ]+/g, "").trim().replace(/\s+/g, " ").slice(0, 60) || "Company";
  return `BuildPro Client Representation Agreement - ${kind} - ${safe} - ${requestId.slice(0, 8)}.pdf`;
}
