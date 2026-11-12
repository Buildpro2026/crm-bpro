import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Every action name the app writes. Adding a name is additive; never rename
// one, because the audit history must stay readable.
export type AuditAction =
  | "company_created"
  | "company_updated"
  | "contact_created"
  | "contact_updated"
  | "link_created"
  | "page_viewed"
  | "link_access_denied"
  | "link_expired"
  | "link_revoked"
  | "form_submitted"
  | "client_signed"
  | "pdf_generated"
  | "countersigned"
  | "document_downloaded"
  | "executed_copy_downloaded"
  // Milestone 2
  | "deal_created"
  | "deal_updated"
  | "deal_stage_changed"
  | "note_added"
  | "note_deleted"
  | "task_created"
  | "task_completed"
  | "task_reopened"
  | "task_deleted"
  // Candidates and files
  | "candidate_created"
  | "candidate_updated"
  | "file_uploaded"
  | "file_deleted"
  | "document_generated"
  | "candidate_link_created"
  | "candidate_link_revoked"
  | "candidate_page_viewed"
  | "candidate_link_denied"
  | "candidate_signed"
  | "candidate_copy_downloaded";

export type AuditEntry = {
  actor: string; // 'owner:<uuid>' | 'client' | 'system'
  action: AuditAction;
  companyId?: string | null;
  signatureRequestId?: string | null;
  candidateId?: string | null;
  detail?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

// Throws on failure. A step that cannot be audited must not look successful.
export async function writeAudit(client: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await client.from("audit_log").insert({
    actor: entry.actor,
    action: entry.action,
    company_id: entry.companyId ?? null,
    signature_request_id: entry.signatureRequestId ?? null,
    // Only sent when set, so audit writes keep working on a database that has
    // not yet applied migration 0003.
    ...(entry.candidateId ? { candidate_id: entry.candidateId } : {}),
    detail: entry.detail ?? {},
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
  });
  if (error) {
    throw new Error(`Audit write failed for ${entry.action}: ${error.message}`);
  }
}
