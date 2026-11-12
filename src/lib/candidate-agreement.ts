// Candidate Representation Agreement, verbatim from BuildPro's candidate
// agreement form, and the details the candidate confirms when signing.
// Plain module: safe for client components. Changing any wording requires a
// new CANDIDATE_TEMPLATE_VERSION so earlier signed copies keep their text.

export const CANDIDATE_TEMPLATE_VERSION = "v1";
export const CANDIDATE_AGREEMENT_TITLE = "CANDIDATE REPRESENTATION AGREEMENT";

export const CANDIDATE_AGREEMENT_PARAGRAPHS: readonly string[] = [
  'This Candidate Representation Agreement (the "Agreement") is entered into as of the date the Candidate signs below by and between BuildPro Recruiters, LLC, doing business as BuildPro Recruiters ("BuildPro"), and the individual who completes and signs this form ("Candidate").',
  "1. PURPOSE",
  "1.1 Representation. Candidate authorizes BuildPro to act as Candidate's recruiter: to discuss Candidate's background and goals, identify employment opportunities, and, with Candidate's approval as described in Section 2, present Candidate to prospective employers (\"Employers\").",
  "1.2 No Fee to Candidate. BuildPro is paid only by Employers. BuildPro will never charge Candidate any fee, deposit, or cost of any kind for its services, and nothing in this Agreement requires Candidate to pay BuildPro anything.",
  "1.3 No Guarantee. BuildPro will use reasonable efforts on Candidate's behalf but does not guarantee any interview, offer, or employment. Employers make all hiring decisions.",
  "2. SUBMISSIONS TO EMPLOYERS",
  "2.1 Approval First. BuildPro will not send Candidate's resume or identify Candidate by name to any Employer without first telling Candidate the Employer's name (or, where confidential, a description of the company and role) and receiving Candidate's approval, which may be given by phone, text, or email.",
  "2.2 Avoiding Duplicate Submissions. Before approving a submission, Candidate will tell BuildPro if Candidate has applied to, interviewed with, or been submitted to that Employer within the past six (6) months, directly or through another recruiter. Duplicate submissions can disqualify a candidate, so this protects Candidate.",
  "2.3 Representation for Approved Submissions. Once Candidate approves a submission to an Employer, Candidate agrees that, for twelve (12) months, BuildPro will be Candidate's sole recruiter for that Employer, and Candidate will not authorize another recruiter or agency to submit Candidate to the same Employer. Candidate remains free to work with other recruiters for other employers.",
  "2.4 Keeping BuildPro Informed. If an Employer that BuildPro introduced contacts Candidate directly, schedules an interview, or extends an offer, Candidate will let BuildPro know promptly so BuildPro can support Candidate through the process.",
  "3. CANDIDATE INFORMATION",
  "3.1 Accuracy. Candidate confirms that the resume and information Candidate gives BuildPro, including work history, education, licenses, and compensation, are true and complete to the best of Candidate's knowledge, and will update BuildPro if anything changes.",
  "3.2 Use and Sharing. Candidate authorizes BuildPro to use Candidate's information to find and evaluate opportunities and to share it with Employers that Candidate approves under Section 2. BuildPro will not sell Candidate's personal information.",
  "3.3 Background Checks. BuildPro does not run background, credit, or drug checks under this Agreement. Any such check will be requested separately by the Employer or its screening provider with Candidate's separate written authorization, as required by law.",
  "3.4 References. BuildPro will contact Candidate's references only with Candidate's permission.",
  "3.5 Privacy and Retention. BuildPro keeps Candidate's information confidential except as described here. Candidate may ask BuildPro at any time to update Candidate's information or to delete it from BuildPro's files, subject to records BuildPro must keep by law.",
  "4. COMMUNICATIONS",
  "4.1 Contact. Candidate agrees that BuildPro may contact Candidate about opportunities by phone, email, and, if Candidate opts in below, text message. Message and data rates may apply. Candidate may opt out of texts at any time by replying STOP, and may opt out of any communication by telling BuildPro.",
  "5. EQUAL OPPORTUNITY",
  "5.1 BuildPro recruits and refers candidates without regard to race, color, religion, sex, pregnancy, sexual orientation, gender identity, national origin, age, disability, genetic information, veteran status, or any other characteristic protected by law.",
  "6. RELATIONSHIP",
  "6.1 Not Employment. This Agreement does not make Candidate an employee of BuildPro. If Candidate is hired, Candidate's employer is the Employer, which alone sets the terms of employment.",
  "7. TERM AND ENDING THIS AGREEMENT",
  "7.1 Term. This Agreement lasts twelve (12) months from the date Candidate signs, and renews automatically for additional twelve (12) month periods unless either party ends it.",
  "7.2 Ending It. Either party may end this Agreement at any time by written notice; email is enough. Ending the Agreement does not affect Section 2.3 for Employers to which Candidate was already submitted, or Section 3.5.",
  "8. GENERAL",
  "8.1 Governing Law. This Agreement is governed by the laws of the State of Texas.",
  "8.2 Entire Agreement. This is the entire agreement between BuildPro and Candidate about recruiting services. It may be changed only in writing (email is enough) agreed by both.",
  "8.3 Electronic Signature. Candidate agrees that typing Candidate's name below is Candidate's electronic signature and has the same effect as a handwritten signature, under the Texas Uniform Electronic Transactions Act and the federal E-SIGN Act.",
];

export const CANDIDATE_AGREEMENT_FULL_TEXT = [CANDIDATE_AGREEMENT_TITLE, ...CANDIDATE_AGREEMENT_PARAGRAPHS].join("\n\n");

export const CANDIDATE_BUILDPRO_ACCEPTANCE =
  "BuildPro Recruiters, LLC, by Lee Chandler, Executive Recruiter. There is never a fee to you for our services.";

export const CANDIDATE_CONSENT_TEXT =
  "I have read and agree to this Candidate Representation Agreement. I understand BuildPro will never charge me a fee and will not submit me to any employer without my approval.";

export const TEXT_OPT_IN_YES = "Yes, BuildPro may text me about opportunities at the mobile number above";
export const TEXT_OPT_IN_NO = "No, please do not text me";

// The details a candidate confirms on the signing page. Most are pre-filled
// from the candidate record.
export const CANDIDATE_SIGNING_FIELDS = [
  { key: "full_name", label: "Full legal name", required: true, maxLength: 200, type: "text" },
  { key: "email", label: "Email", required: true, maxLength: 320, type: "email" },
  { key: "phone", label: "Mobile phone", required: true, maxLength: 40, type: "tel" },
  { key: "city_state", label: "City and state where you live", required: true, maxLength: 200, type: "text" },
  { key: "current_title", label: "Current or most recent job title", required: false, maxLength: 200, type: "text" },
  { key: "linkedin_url", label: "LinkedIn profile link (optional)", required: false, maxLength: 300, type: "text" },
  {
    key: "recent_submissions",
    label:
      'Companies you have applied to, interviewed with, or been submitted to by another recruiter in the last 6 months (so we never duplicate a submission). Write "None" if none.',
    required: true,
    maxLength: 4000,
    type: "textarea",
  },
] as const;

export type CandidateSigningKey = (typeof CANDIDATE_SIGNING_FIELDS)[number]["key"];
export type CandidateSigningAnswers = Record<CandidateSigningKey, string>;

export type CandidateSignatureSubmission = {
  answers: CandidateSigningAnswers;
  textOptIn: boolean;
  signatureName: string;
  consent: boolean;
};

export function validateCandidateSubmission(input: {
  answers: Record<string, string>;
  textOptIn: string;
  signatureName: string;
  consent: boolean;
}): { ok: true; data: CandidateSignatureSubmission } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const answers = {} as CandidateSigningAnswers;
  for (const field of CANDIDATE_SIGNING_FIELDS) {
    const value = (input.answers[field.key] ?? "").trim();
    if (field.required && !value) errors[field.key] = "This field is required.";
    else if (value.length > field.maxLength) errors[field.key] = `Please keep this under ${field.maxLength} characters.`;
    answers[field.key] = value;
  }
  if (answers.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)) errors.email = "Enter a valid email address.";
  if (input.textOptIn !== "yes" && input.textOptIn !== "no") errors.text_opt_in = "Choose whether we may text you.";
  const signatureName = input.signatureName.trim();
  if (!signatureName) errors.signature_name = "Type your full legal name to sign.";
  else if (signatureName.length > 200) errors.signature_name = "Please keep this under 200 characters.";
  else if (answers.full_name && normalizeName(signatureName) !== normalizeName(answers.full_name)) {
    errors.signature_name = "Type your name exactly as entered in Full legal name.";
  }
  if (!input.consent) errors.consent = "Check the box to agree before signing.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { answers, textOptIn: input.textOptIn === "yes", signatureName, consent: true } };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
