// Plain text module with no server-only imports, so client components can
// show the agreement. The hash of this text is computed on the server
// (see lib/documents/packet.ts) and stored with each signature request.

// Client Representation Agreement, version 1. The wording below is the
// approved text and must not be edited in place. A changed agreement gets a
// new TEMPLATE_VERSION, so every signed request keeps the text it was signed
// against (signature_requests.template_version and template_sha256).

export const TEMPLATE_KEY = "client_representation_agreement";
export const TEMPLATE_VERSION = "v1";

export const AGREEMENT_TITLE = "CLIENT REPRESENTATION AGREEMENT";

export const AGREEMENT_PARAGRAPHS: readonly string[] = [
  "This Client Representation Agreement is entered into as of the date last signed below, by and between BuildPro Recruiters, LLC, referred to as BuildPro, and the client named in the signature block below, referred to as Client.",
  "1. Services. BuildPro will provide executive search and recruiting services to Client. BuildPro will identify, screen, and present qualified candidates for positions that Client authorizes BuildPro to fill. BuildPro will present a short slate of qualified candidates for each search rather than a volume of resumes.",
  "2. Fee. Contingency Search. No fee is owed unless Client hires a candidate referred by BuildPro Recruiters, LLC, in any position. The fee is twenty percent (20%) of the placed candidate's first year salary, earned when the candidate begins employment. BuildPro Recruiters, LLC will invoice Client on the candidate's date of hire, and payment is due fifteen (15) days from the date of hire.",
  "3. Referral Period. Each candidate presented by BuildPro is a BuildPro referral for twelve (12) months from the date of presentation. If Client hires a referred candidate at any time during that period, in any position, the fee in Section 2 is owed, whether or not the hire is for the position the candidate was originally presented for.",
  "4. Replacement Guarantee. If a placed candidate's employment ends within ninety (90) days of the start date, for any reason other than a reduction in force or a material change to the position, BuildPro will conduct one replacement search for the same position at no additional fee. This guarantee applies provided the original fee was paid in full within the terms of this Agreement. The guarantee is a replacement search only. No fee will be refunded.",
  "5. Client Responsibilities. Client will provide timely interview scheduling and feedback on presented candidates. Client makes all hiring decisions and is the employer of any candidate hired. Client is responsible for verifying credentials, and for any background checks, drug screening, or licensing confirmation it requires.",
  "6. Confidentiality. Each party will keep confidential all nonpublic information received from the other party in connection with this Agreement, including candidate information and the terms of any search, and will use that information only for the purposes of this Agreement.",
  "7. Term and Termination. This Agreement begins on the date last signed below and continues until either party terminates it by written notice to the other party. Termination does not affect any fee owed for a candidate referred before the date of termination, and Sections 2, 3, and 6 survive termination as they apply to those referrals.",
  "8. Governing Law. This Agreement is governed by the laws of the State of Texas.",
  "9. Entire Agreement. This Agreement is the entire agreement between the parties regarding recruiting services and replaces all prior discussions and agreements on that subject. It may be changed only in a writing signed by both parties. Notices under this Agreement must be in writing, and email is sufficient.",
];

export const BUILDPRO_SIGNATORY = {
  company: "BuildPro Recruiters, LLC",
  name: "Lee Chandler",
  title: "Owner",
};

export const AGREEMENT_FULL_TEXT = [AGREEMENT_TITLE, ...AGREEMENT_PARAGRAPHS].join("\n\n");
