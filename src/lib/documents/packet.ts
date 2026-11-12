import "server-only";
import { sha256Hex } from "@/lib/crypto";
import {
  AGREEMENT_PARAGRAPHS,
  AGREEMENT_TITLE,
  BUILDPRO_SIGNATORY,
} from "@/lib/agreement";
import { formatCentralDate, formatCentralDateTime } from "@/lib/time";
import { INTAKE_FIELDS, INTAKE_SECTIONS, type IntakeAnswers } from "@/lib/intake-form";
import { PdfLayout } from "@/lib/documents/pdf-writer";

export type SignatureInput =
  | { kind: "drawn"; png: Uint8Array }
  | { kind: "typed"; text: string };

export type CountersignInput = {
  name: string;
  title: string;
  signedAt: Date;
};

export type PacketInput = {
  variant: "client_signed" | "executed";
  requestId: string;
  companyName: string;
  templateVersion: string;
  templateSha256: string;
  intakeFormVersion: string;
  answers: IntakeAnswers;
  signer: {
    name: string;
    title: string;
    email: string;
    signedAt: Date;
    method: "drawn" | "typed";
    signature: SignatureInput;
    ipAddress: string | null;
    userAgent: string | null;
  };
  countersign: CountersignInput | null;
  clientSignedSha256: string | null; // set only on the executed copy
  generatedAt: Date;
};

export type PacketResult = {
  bytes: Uint8Array;
  contentSha256: string;
};

// Fingerprint of the signed content: agreement version, form answers and
// signer identity at signing time. It is the same for the client-signed copy
// and the executed copy, because countersignature does not change the
// content the client agreed to.
export function computeContentSha256(input: {
  requestId: string;
  templateSha256: string;
  intakeFormVersion: string;
  answers: IntakeAnswers;
  signer: { name: string; title: string; email: string; signedAt: Date };
}): string {
  const ordered: Record<string, string> = {};
  for (const field of INTAKE_FIELDS) {
    ordered[field.key] = input.answers[field.key] ?? "";
  }
  const canonical = JSON.stringify({
    request_id: input.requestId,
    template_sha256: input.templateSha256,
    intake_form_version: input.intakeFormVersion,
    answers: ordered,
    signer: {
      name: input.signer.name,
      title: input.signer.title,
      email: input.signer.email,
      signed_at: input.signer.signedAt.toISOString(),
    },
  });
  return sha256Hex(canonical);
}

export async function buildSigningPacket(input: PacketInput): Promise<PacketResult> {
  const contentSha256 = computeContentSha256({
    requestId: input.requestId,
    templateSha256: input.templateSha256,
    intakeFormVersion: input.intakeFormVersion,
    answers: input.answers,
    signer: input.signer,
  });

  const layout = await PdfLayout.create();
  const doc = layout.document;
  const isExecuted = input.variant === "executed";
  const copyLabel = isExecuted ? "Executed copy" : "Client-signed copy";

  doc.setTitle(`${AGREEMENT_TITLE} - ${input.companyName} (${copyLabel})`);
  doc.setAuthor(BUILDPRO_SIGNATORY.company);
  doc.setCreator("BuildPro CRM");
  doc.setProducer("BuildPro CRM");
  doc.setCreationDate(input.generatedAt);
  doc.setModificationDate(input.generatedAt);

  const { fonts } = layout;

  // Part 1: the agreement text, verbatim.
  layout.text(AGREEMENT_TITLE, { font: fonts.bodyBold, size: 15, gapAfter: 10 });
  for (const paragraph of AGREEMENT_PARAGRAPHS) {
    layout.text(paragraph, { font: fonts.body, size: 10.5, gapAfter: 7 });
  }

  // Signature blocks.
  layout.heading("Signatures");

  layout.label("BUILDPRO RECRUITERS, LLC");
  if (input.countersign) {
    layout.text(`/s/ ${input.countersign.name}`, {
      font: fonts.bodyItalic,
      size: 20,
      gapAfter: 4,
    });
  } else {
    layout.text("Pending countersignature", {
      font: fonts.bodyItalic,
      size: 11,
      color: undefined,
      gapAfter: 22,
    });
  }
  layout.text(`Printed name: ${BUILDPRO_SIGNATORY.name}`, { font: fonts.body, size: 10.5 });
  layout.text(`Title: ${input.countersign?.title ?? BUILDPRO_SIGNATORY.title}`, {
    font: fonts.body,
    size: 10.5,
  });
  layout.text(
    `Date: ${input.countersign ? formatCentralDate(input.countersign.signedAt) : "____________________"}`,
    { font: fonts.body, size: 10.5, gapAfter: 14 },
  );

  layout.label(`CLIENT: ${input.companyName}`);
  await drawSignature(layout, input.signer.signature, input.signer.name);
  layout.text(`Printed name: ${input.signer.name}`, { font: fonts.body, size: 10.5 });
  layout.text(`Title: ${input.signer.title}`, { font: fonts.body, size: 10.5 });
  layout.text(`Date: ${formatCentralDate(input.signer.signedAt)}`, {
    font: fonts.body,
    size: 10.5,
    gapAfter: 6,
  });

  // Part 2: the completed Client Search Information Form.
  layout.newPage();
  layout.text("CLIENT SEARCH INFORMATION FORM", { font: fonts.bodyBold, size: 15, gapAfter: 4 });
  layout.text(
    `Form version ${input.intakeFormVersion}. Answers as submitted by the Client on ${formatCentralDateTime(
      input.signer.signedAt,
    )} (Central Time).`,
    { font: fonts.body, size: 9.5, color: undefined, gapAfter: 8 },
  );
  for (const section of INTAKE_SECTIONS) {
    layout.heading(section.title, 11);
    for (const field of section.fields) {
      layout.label(field.label);
      layout.text(input.answers[field.key] || "-", {
        font: fonts.body,
        size: 10.5,
        indent: 12,
        gapAfter: 6,
      });
    }
  }

  // Part 3: the signature certificate.
  layout.newPage();
  layout.text("SIGNATURE CERTIFICATE", { font: fonts.bodyBold, size: 15, gapAfter: 10 });
  const rows: Array<[string, string]> = [
    ["Signature request ID", input.requestId],
    [
      "Documents",
      `${AGREEMENT_TITLE} (template ${input.templateVersion}) and Client Search Information Form (${input.intakeFormVersion})`,
    ],
    ["Copy", copyLabel],
    ["Client company", input.companyName],
    ["Signer name", input.signer.name],
    ["Signer title", input.signer.title],
    ["Signer email", input.signer.email],
    [
      "Signature method",
      input.signer.method === "drawn" ? "Drawn signature" : "Typed name adopted as signature",
    ],
    [
      "Consent",
      "The signer agreed to sign electronically and to receive the executed copy electronically.",
    ],
    ["Signed (Central Time)", formatCentralDateTime(input.signer.signedAt)],
    ["IP address", input.signer.ipAddress ?? "Not recorded"],
    ["User agent", input.signer.userAgent ?? "Not recorded"],
    [
      "Countersigned by",
      input.countersign
        ? `${input.countersign.name}, ${input.countersign.title}, ${BUILDPRO_SIGNATORY.company}`
        : "Not yet countersigned",
    ],
    [
      "Countersigned (Central Time)",
      input.countersign ? formatCentralDateTime(input.countersign.signedAt) : "Not yet countersigned",
    ],
    ["Agreement template SHA-256", input.templateSha256],
    ["Agreement and form content SHA-256", contentSha256],
    [
      "Client-signed copy SHA-256",
      input.clientSignedSha256 ?? "Not applicable (this is the client-signed copy)",
    ],
    ["Generated (Central Time)", formatCentralDateTime(input.generatedAt)],
  ];
  for (const [label, value] of rows) {
    layout.label(label);
    layout.text(value, { font: fonts.body, size: 10, gapAfter: 5 });
  }
  layout.space(6);
  layout.text(
    "The SHA-256 of this file is recorded when it is stored, and BuildPro CRM checks it each time the file is downloaded. The content fingerprint above is computed from the agreement version, the form answers, and the signer details.",
    { font: fonts.body, size: 9, color: undefined, gapAfter: 0 },
  );

  layout.stampPages(`Signature request ${input.requestId}  |  ${copyLabel}`);
  const bytes = await layout.save();
  return { bytes, contentSha256 };
}

async function drawSignature(
  layout: PdfLayout,
  signature: SignatureInput,
  typedFallbackName: string,
): Promise<void> {
  if (signature.kind === "drawn") {
    const image = await layout.document.embedPng(signature.png);
    layout.image(image, 230, 70);
  } else {
    layout.text(signature.text || typedFallbackName, {
      font: layout.fonts.bodyItalic,
      size: 20,
      gapAfter: 4,
    });
  }
}
