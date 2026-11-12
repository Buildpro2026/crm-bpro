import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildAboutBuildProPdf, buildCandidateAgreementPdf } from "@/lib/documents/generated";
import {
  CANDIDATE_AGREEMENT_PARAGRAPHS,
  CANDIDATE_SIGNING_FIELDS,
  validateCandidateSubmission,
  type CandidateSigningAnswers,
} from "@/lib/candidate-agreement";
import { CANDIDATE_STATUSES, validateCandidateInput } from "@/lib/candidates";
import {
  CANDIDATE_FOLDERS,
  COMPANY_FOLDERS,
  contentTypeFor,
  isFolderFor,
  MAX_UPLOAD_BYTES,
  safeFileName,
  validateUpload,
} from "@/lib/files";
import { pdfSafe } from "@/lib/documents/text";

const MIGRATION_3 = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/0003_candidates_and_files.sql", import.meta.url)),
  "utf8",
);

async function extractText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0, useSystemFonts: false, disableFontFace: true }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    for (const item of content.items) if ("str" in item) text += item.str + " ";
  }
  return text;
}
const squash = (s: string) => s.replace(/\s+/g, "");

const ANSWERS: CandidateSigningAnswers = {
  full_name: "Jordan Rivera",
  email: "jordan@example.com",
  phone: "214-555-0199",
  city_state: "Frisco, TX",
  current_title: "Project Coordinator",
  linkedin_url: "linkedin.com/in/jordan",
  recent_submissions: "None",
};

describe("lists match the database", () => {
  it("every folder and candidate status appears in the 0003 check constraints", () => {
    for (const f of [...COMPANY_FOLDERS, ...CANDIDATE_FOLDERS]) expect(MIGRATION_3).toContain(`'${f.value}'`);
    for (const s of CANDIDATE_STATUSES) expect(MIGRATION_3).toContain(`'${s.value}'`);
  });
});

describe("file rules", () => {
  it("allows common office files and rejects others", () => {
    expect(validateUpload({ name: "resume.PDF", size: 1000 })).toBeNull();
    expect(validateUpload({ name: "offer.docx", size: 1000 })).toBeNull();
    expect(validateUpload({ name: "virus.exe", size: 1000 })).toMatch(/not allowed/);
    expect(validateUpload({ name: "big.pdf", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/10 MB/);
    expect(validateUpload({ name: "", size: 0 })).toMatch(/Choose a file/);
    expect(contentTypeFor("photo.JPG")).toBe("image/jpeg");
  });

  it("makes file names safe for storage paths", () => {
    expect(safeFileName("../../etc/Résumé (final)!.pdf")).toBe("Resume (final).pdf");
    expect(safeFileName("C:\\Users\\me\\offer letter.docx")).toBe("offer letter.docx");
    expect(safeFileName("???.pdf")).toBe("file.pdf");
  });

  it("keeps company and candidate folders apart", () => {
    expect(isFolderFor("company", "invoices")).toBe(true);
    expect(isFolderFor("candidate", "invoices")).toBe(false);
    expect(isFolderFor("candidate", "resumes")).toBe(true);
  });
});

describe("candidate validation", () => {
  it("accepts a minimal candidate and rejects bad fields", () => {
    expect(validateCandidateInput({ full_name: "Jordan Rivera" }).ok).toBe(true);
    const bad = validateCandidateInput({
      full_name: "",
      status: "hot",
      email: "nope",
      desired_salary: "lots",
      linkedin_url: "example.com/me",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["desired_salary", "email", "full_name", "linkedin_url", "status"]);
  });

  it("requires consent, a text choice, and a typed name that matches", () => {
    const ok = validateCandidateSubmission({ answers: ANSWERS, textOptIn: "yes", signatureName: "jordan rivera", consent: true });
    expect(ok.ok).toBe(true);
    const bad = validateCandidateSubmission({
      answers: { ...ANSWERS, recent_submissions: "" },
      textOptIn: "",
      signatureName: "Someone Else",
      consent: false,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["consent", "recent_submissions", "signature_name", "text_opt_in"]);
  });
});

describe("auto-filled documents", () => {
  it("About BuildPro is prepared for the company and has no BuildPro email address", async () => {
    const text = await extractText(await buildAboutBuildProPdf({ companyName: "Hanover Signature Homes", generatedAt: new Date() }));
    const flat = squash(text);
    expect(flat).toContain(squash("Prepared for Hanover Signature Homes"));
    expect(flat).toContain(squash("60-day replacement guarantee"));
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/\[[A-Z ]+\]/); // no unfilled template placeholders
  });

  it("the signed candidate agreement carries the full text, the details, and the signature certificate", async () => {
    const text = await extractText(
      await buildCandidateAgreementPdf({
        agreementId: "55555555-5555-4555-8555-555555555555",
        templateSha256: "e".repeat(64),
        answers: ANSWERS,
        textOptIn: true,
        signatureName: "Jordan Rivera",
        signedAt: new Date("2026-11-12T18:00:00Z"),
        ipAddress: "203.0.113.9",
        userAgent: "Test Browser",
      }),
    );
    const flat = squash(text);
    for (const p of CANDIDATE_AGREEMENT_PARAGRAPHS) expect(flat).toContain(squash(pdfSafe(p)));
    for (const f of CANDIDATE_SIGNING_FIELDS) expect(flat, f.key).toContain(squash(ANSWERS[f.key]));
    expect(flat).toContain(squash("203.0.113.9"));
    expect(flat).toContain(squash("Nov 12, 2026, 12:00:00 PM CST"));
    expect(flat).toContain(squash("Yes, BuildPro may text me"));
  });
});
