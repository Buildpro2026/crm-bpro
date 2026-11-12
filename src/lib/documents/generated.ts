import "server-only";
import { PdfLayout } from "@/lib/documents/pdf-writer";
import { formatCentralDate, formatCentralDateTime } from "@/lib/time";
import { BUILDPRO_SIGNATORY } from "@/lib/agreement";
import {
  CANDIDATE_AGREEMENT_PARAGRAPHS,
  CANDIDATE_AGREEMENT_TITLE,
  CANDIDATE_BUILDPRO_ACCEPTANCE,
  CANDIDATE_CONSENT_TEXT,
  CANDIDATE_SIGNING_FIELDS,
  CANDIDATE_TEMPLATE_VERSION,
  TEXT_OPT_IN_NO,
  TEXT_OPT_IN_YES,
  type CandidateSigningAnswers,
} from "@/lib/candidate-agreement";

// ---------------------------------------------------------------------------
// About BuildPro Recruiters, prepared for one client company. Wording follows
// BuildPro's "02 About BuildPro Recruiters" template. No BuildPro email
// address appears, by policy.
// ---------------------------------------------------------------------------

const PROCESS: ReadonlyArray<[string, string]> = [
  ["Discovery", "Intake questionnaire and kick-off call to define the role, the ideal profile, compensation, and timeline."],
  ["Sourcing", "We search our network and active channels for candidates matching your criteria."],
  [
    "Screening",
    "Phone/video interviews to evaluate skills, experience, work history, communication, availability, and cultural fit.",
  ],
  ["Presentation", "You receive a short list with resumes and our written recruiter notes on each candidate."],
  ["Interviews", "We schedule interviews and gather feedback from both sides to keep the process moving."],
  ["Offer & Hire", "We help structure the offer, manage negotiations, and keep the candidate engaged through their start date."],
  ["Follow-up", "We check in during the first weeks. Our 60-day replacement guarantee protects your hire."],
];

export async function buildAboutBuildProPdf(input: { companyName: string; generatedAt: Date }): Promise<Uint8Array> {
  const layout = await PdfLayout.create();
  const { fonts } = layout;
  const body = (t: string, gap = 6) => layout.text(t, { font: fonts.body, size: 11, gapAfter: gap });
  const bullet = (t: string) => layout.text(`-  ${t}`, { font: fonts.body, size: 11, gapAfter: 3, indent: 10 });

  layout.text("ABOUT BUILDPRO RECRUITERS", { font: fonts.sansBold, size: 18, gapAfter: 4 });
  layout.text(`Prepared for ${input.companyName}`, { font: fonts.bodyItalic, size: 12, gapAfter: 14 });

  layout.heading("Who We Are");
  body(
    "BuildPro Recruiters is a professional recruiting firm that connects employers with qualified, vetted talent. We work as an extension of your hiring team: we learn your business, find and screen candidates, and present only the people we believe fit your role and your culture.",
  );

  layout.heading("What We Do");
  bullet("Direct-hire (permanent) placement of professional, administrative, and operations talent.");
  bullet("Targeted search: we actively source candidates, not just post and wait.");
  bullet("Screening and vetting: every candidate we present has been interviewed by a recruiter.");
  bullet("Hiring support: interview coordination, feedback collection, offer guidance, and follow-up after the hire.");

  layout.heading("Our Process");
  PROCESS.forEach(([phase, what], i) => {
    layout.text(`${i + 1}. ${phase}`, { font: fonts.bodyBold, size: 11, gapAfter: 1 });
    layout.text(what, { font: fonts.body, size: 11, gapAfter: 5, indent: 14 });
  });

  layout.heading("How We Are Paid");
  bullet("Contingency based: no up-front fees and no retainer. You pay only when you hire a candidate we present.");
  bullet("Fee: 20% of the candidate's first-year salary, as defined in the Agreement, due within 15 days of the hire date.");
  bullet(
    "60-day replacement guarantee: if a placed candidate does not stay at least 60 days (subject to the Agreement's terms), we provide one replacement at no additional fee. This is a replacement guarantee, not a refund.",
  );

  layout.heading("Our Commitments to You");
  bullet("Confidentiality for your company information and your hiring plans.");
  bullet("Candidates are never charged a fee by BuildPro Recruiters.");
  bullet("Equal-opportunity recruiting: we recruit and refer candidates without regard to any legally protected characteristic.");
  bullet("Honest, timely communication, including when the market is tight.");

  layout.heading("What We Ask of You");
  bullet("Give us accurate, complete information about the role and compensation.");
  bullet("Respond to candidate submissions and schedule interviews promptly. Great candidates are off the market quickly.");
  bullet("Share candidate feedback so we can refine the search.");
  bullet("Notify us as soon as an offer is extended and accepted.");

  layout.heading("Your BuildPro Team");
  layout.label("ASSIGNED RECRUITER");
  body(`${BUILDPRO_SIGNATORY.name}, ${BUILDPRO_SIGNATORY.title}`, 4);
  layout.label("OFFICE PHONE");
  body("214-238-5145", 4);
  layout.label("WEBSITE");
  body("buildprorecruiters.com", 4);

  layout.stampPages(`About BuildPro Recruiters | Prepared for ${input.companyName} | ${formatCentralDate(input.generatedAt)}`);
  return layout.save();
}

// ---------------------------------------------------------------------------
// Signed Candidate Representation Agreement
// ---------------------------------------------------------------------------

export type CandidateAgreementPdfInput = {
  agreementId: string;
  templateSha256: string;
  answers: CandidateSigningAnswers;
  textOptIn: boolean;
  signatureName: string;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function buildCandidateAgreementPdf(input: CandidateAgreementPdfInput): Promise<Uint8Array> {
  const layout = await PdfLayout.create();
  const { fonts } = layout;

  layout.text(CANDIDATE_AGREEMENT_TITLE, { font: fonts.bodyBold, size: 15, gapAfter: 10 });
  for (const paragraph of CANDIDATE_AGREEMENT_PARAGRAPHS) {
    const isHeading = /^\d+\. [A-Z ]+$/.test(paragraph);
    layout.text(paragraph, {
      font: isHeading ? fonts.bodyBold : fonts.body,
      size: 10.5,
      gapAfter: isHeading ? 3 : 7,
    });
  }

  layout.heading("Candidate Details");
  for (const field of CANDIDATE_SIGNING_FIELDS) {
    layout.label(field.label);
    layout.text(input.answers[field.key] || "-", { font: fonts.body, size: 10.5, gapAfter: 5 });
  }
  layout.label("TEXT MESSAGES");
  layout.text(input.textOptIn ? TEXT_OPT_IN_YES : TEXT_OPT_IN_NO, { font: fonts.body, size: 10.5, gapAfter: 5 });

  layout.heading("Agreed and Accepted");
  layout.text(CANDIDATE_BUILDPRO_ACCEPTANCE, { font: fonts.body, size: 10.5, gapAfter: 8 });
  layout.label("CANDIDATE AGREEMENT");
  layout.text(`[X] ${CANDIDATE_CONSENT_TEXT}`, { font: fonts.body, size: 10.5, gapAfter: 8 });
  layout.label("CANDIDATE SIGNATURE (TYPED)");
  layout.text(input.signatureName, { font: fonts.bodyItalic, size: 16, gapAfter: 4 });
  layout.text(`Printed name: ${input.answers.full_name}`, { font: fonts.body, size: 10.5 });
  layout.text(`Date: ${formatCentralDate(input.signedAt)}`, { font: fonts.body, size: 10.5, gapAfter: 10 });

  layout.heading("Signature Certificate");
  const rows: Array<[string, string]> = [
    ["Agreement ID", input.agreementId],
    ["Template version", CANDIDATE_TEMPLATE_VERSION],
    ["Template SHA-256", input.templateSha256],
    ["Signed (Central Time)", formatCentralDateTime(input.signedAt)],
    ["Signer email", input.answers.email],
    ["IP address", input.ipAddress ?? "Not available"],
    ["Browser", input.userAgent ?? "Not available"],
    ["Method", "Typed name, with explicit consent checkbox, on a BuildPro one-time link"],
  ];
  for (const [label, value] of rows) {
    layout.label(label);
    layout.text(value, { font: fonts.body, size: 10, gapAfter: 5 });
  }

  layout.stampPages(`Candidate Representation Agreement | ${input.answers.full_name} | ID ${input.agreementId}`);
  return layout.save();
}
