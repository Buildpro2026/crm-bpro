import { formatCentralDate } from "@/lib/time";

// Ready-to-paste email for Lee to send from his own mailbox. The app sends
// nothing itself in Milestone 1. The text contains no email address at all.
export function buildSigningEmail(input: {
  contactName: string;
  companyName: string;
  link: string;
  expiresAt: string;
}): string {
  const firstName = input.contactName.trim().split(/\s+/)[0] || "there";
  return [
    `Subject: Client Representation Agreement and Search Information Form - ${input.companyName}`,
    "",
    `Hi ${firstName},`,
    "",
    "Thank you for choosing BuildPro Recruiters. To get your search started, please review and sign our Client Representation Agreement and complete the Client Search Information Form. It takes about 15 minutes.",
    "",
    "Use this secure link:",
    input.link,
    "",
    `The link is valid until ${formatCentralDate(input.expiresAt)}. If you have any questions, call us at 214-238-5145.`,
    "",
    "Thank you,",
    "Lee Chandler",
    "BuildPro Recruiters, LLC",
    "214-238-5145",
    "buildprorecruiters.com",
  ].join("\n");
}
