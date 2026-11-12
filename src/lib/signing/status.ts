// Status as a person should read it. The stored status changes only when the
// link is next used, so a request whose expiry has passed is shown as expired
// even before anyone opens it. Pure function, no database access.

export const REQUEST_STATUSES = [
  "created",
  "viewed",
  "client signed",
  "fully executed",
  "expired",
  "revoked",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function effectiveStatus(
  row: { status: string; expires_at: string },
  now: Date = new Date(),
): RequestStatus {
  if ((row.status === "created" || row.status === "viewed") && new Date(row.expires_at) <= now) {
    return "expired";
  }
  return row.status as RequestStatus;
}

export function isOpenForAction(status: RequestStatus): boolean {
  return status === "created" || status === "viewed";
}

export const STATUS_STYLE: Record<RequestStatus, string> = {
  created: "bg-slate-100 text-slate-700 ring-slate-300",
  viewed: "bg-sky-50 text-sky-800 ring-sky-300",
  "client signed": "bg-amber-50 text-amber-900 ring-amber-300",
  "fully executed": "bg-emerald-50 text-emerald-800 ring-emerald-300",
  expired: "bg-zinc-100 text-zinc-600 ring-zinc-300",
  revoked: "bg-red-50 text-red-800 ring-red-300",
};

const ACTION_LABELS: Record<string, string> = {
  company_created: "Company created",
  company_updated: "Company updated",
  contact_created: "Contact added",
  contact_updated: "Contact updated",
  link_created: "Link created",
  page_viewed: "Client page viewed",
  link_access_denied: "Link used after it closed",
  link_expired: "Link expired",
  link_revoked: "Link revoked",
  form_submitted: "Search information form submitted",
  client_signed: "Client signed",
  pdf_generated: "PDF generated",
  countersigned: "Countersigned by BuildPro",
  document_downloaded: "Document downloaded",
  executed_copy_downloaded: "Executed copy downloaded by client",
  deal_created: "Deal created",
  deal_updated: "Deal updated",
  deal_stage_changed: "Deal stage changed",
  note_added: "Note added",
  note_deleted: "Note deleted",
  task_created: "Task created",
  task_completed: "Task completed",
  task_reopened: "Task reopened",
  task_deleted: "Task deleted",
  candidate_created: "Candidate added",
  candidate_updated: "Candidate updated",
  file_uploaded: "File uploaded",
  file_deleted: "File deleted",
  document_generated: "Document generated",
  candidate_link_created: "Candidate agreement link created",
  candidate_link_revoked: "Candidate agreement link revoked",
  candidate_page_viewed: "Candidate opened the agreement",
  candidate_link_denied: "Candidate link used after it closed",
  candidate_signed: "Candidate signed the agreement",
  candidate_copy_downloaded: "Candidate downloaded their signed copy",
  api_key_created: "Agent API key created",
  api_key_revoked: "Agent API key revoked",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
