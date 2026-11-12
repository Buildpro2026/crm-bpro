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
  | "executed_copy_downloaded";

export type AuditEntry = {
  actor: string; // 'owner:<uuid>' | 'client' | 'system'
  action: AuditAction;
  companyId?: string | null;
  signatureRequestId?: string | null;
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
    detail: entry.detail ?? {},
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
  });
  if (error) {
    throw new Error(`Audit write failed for ${entry.action}: ${error.message}`);
  }
}
