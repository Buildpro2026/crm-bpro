import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { isUuid } from "@/lib/records";
import { formatCentralDateTime } from "@/lib/time";
import {
  actionLabel,
  effectiveStatus,
  isOpenForAction,
  STATUS_STYLE,
  type RequestStatus,
} from "@/lib/signing/status";
import { NewSignatureRequest } from "@/components/signature-request-panel";
import { RequestActionButton } from "@/components/request-action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  countersignSignatureRequestAction,
  revokeSignatureRequestAction,
} from "../signing-actions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();

  const { data: company } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) notFound();

  const [contactsRes, documentsRes, requestsRes, auditRes] = await Promise.all([
    supabase.from("contacts").select("*").eq("company_id", id).order("name"),
    supabase.from("documents").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("signature_requests").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_log").select("*").eq("company_id", id).order("created_at", { ascending: true }).limit(1000),
  ]);

  const contacts = contactsRes.data ?? [];
  const documents = documentsRes.data ?? [];
  const requests = requestsRes.data ?? [];
  const audit = auditRes.data ?? [];

  const now = new Date();
  const contactById = new Map<string, { id: string; name: string; title: string | null; email: string | null }>(
    contacts.map((c) => [c.id, c]),
  );
  const auditByRequest = new Map<string, typeof audit>();
  for (const entry of audit) {
    if (!entry.signature_request_id) continue;
    const list = auditByRequest.get(entry.signature_request_id) ?? [];
    list.push(entry);
    auditByRequest.set(entry.signature_request_id, list);
  }
  const hasLiveRequest = requests.some((r) => {
    const s = effectiveStatus(r, now);
    return s === "created" || s === "viewed" || s === "client signed";
  });

  return (
    <div className="space-y-8">
      {hasLiveRequest ? <AutoRefresh /> : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/companies" className="text-sm text-slate-600 hover:text-slate-900">
            All companies
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{company.name}</h1>
          <p className="text-sm text-slate-600">
            {[company.industry, [company.hq_city, company.hq_state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join("  |  ") || "No industry or location yet"}
          </p>
          {company.website ? <p className="text-sm text-sky-900">{company.website}</p> : null}
        </div>
        <Link
          href={`/companies/${id}/edit`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
        >
          Edit company
        </Link>
      </div>

      {company.notes ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{company.notes}</p>
        </section>
      ) : null}

      {/* Contacts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Contacts</h2>
          <Link
            href={`/companies/${id}/contacts/new`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Add contact
          </Link>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-600">No contacts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-slate-600">
                    {[c.title, c.email, c.phone].filter(Boolean).join("  |  ") || "No details"}
                  </p>
                </div>
                <Link
                  href={`/companies/${id}/contacts/${c.id}/edit`}
                  className="text-sm text-sky-900 hover:underline"
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Signature requests */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Client agreement and search form</h2>
          <p className="text-sm text-slate-600">
            Creates one signing packet: the Client Representation Agreement plus the Client Search Information
            Form.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">New signing packet</h3>
          <NewSignatureRequest
            companyId={id}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email }))}
          />
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-slate-600">No signing packets yet.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const status: RequestStatus = effectiveStatus(r, now);
              const contact = contactById.get(r.contact_id);
              const entries = auditByRequest.get(r.id) ?? [];
              return (
                <article key={r.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{contact?.name ?? "Unknown contact"}</p>
                      <p className="text-sm text-slate-600">{contact?.title ?? ""}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">Request {r.id}</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}
                    >
                      {status.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Field label="Created" value={formatCentralDateTime(r.created_at)} />
                    <Field
                      label={status === "expired" ? "Expired" : status === "revoked" ? "Revoked" : "Link expires"}
                      value={formatCentralDateTime(status === "revoked" && r.revoked_at ? r.revoked_at : r.expires_at)}
                    />
                    <Field label="Form submitted" value={r.form_submitted_at ? formatCentralDateTime(r.form_submitted_at) : "Not yet"} />
                    <Field
                      label="Client signed"
                      value={
                        r.client_signed_at
                          ? `${formatCentralDateTime(r.client_signed_at)}: ${r.signer_name ?? ""}, ${r.signer_title ?? ""} (${r.signer_email ?? ""})`
                          : "Not yet"
                      }
                    />
                    <Field
                      label="Countersigned"
                      value={r.countersigned_at ? formatCentralDateTime(r.countersigned_at) : "Not yet"}
                    />
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {isOpenForAction(status) || status === "client signed" ? (
                      <RequestActionButton
                        requestId={r.id}
                        label="Revoke link"
                        confirmText="Revoke this link? The client will no longer be able to open or sign it."
                        action={revokeSignatureRequestAction}
                        tone="danger"
                      />
                    ) : null}
                    {status === "client signed" ? (
                      <RequestActionButton
                        requestId={r.id}
                        label="Countersign and finalize"
                        confirmText="Countersign as Lee Chandler and generate the executed agreement? This completes execution."
                        action={countersignSignatureRequestAction}
                        tone="primary"
                      />
                    ) : null}
                    {r.client_signed_document_id ? (
                      <DocLink id={r.client_signed_document_id} documents={documents} />
                    ) : null}
                    {r.executed_document_id ? <DocLink id={r.executed_document_id} documents={documents} /> : null}
                  </div>

                  <details className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-medium text-slate-800">
                      Audit trail ({entries.length} entries)
                    </summary>
                    <ol className="mt-3 space-y-2">
                      {entries.map((e) => (
                        <li key={e.id} className="flex flex-wrap gap-x-3 text-slate-700">
                          <span className="font-mono text-xs text-slate-500">{formatCentralDateTime(e.created_at)}</span>
                          <span className="font-medium">{actionLabel(e.action)}</span>
                          <span className="text-xs text-slate-500">
                            {e.actor.startsWith("owner:") ? "BuildPro (owner)" : e.actor === "client" ? "Client" : "System"}
                            {e.ip_address ? `, IP ${e.ip_address}` : ""}
                          </span>
                        </li>
                      ))}
                      {entries.length === 0 ? <li className="text-slate-500">No entries yet.</li> : null}
                    </ol>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-600">No documents yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Created (Central)</th>
                  <th className="px-4 py-3">SHA-256</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 text-slate-900">{d.file_name}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{d.kind}</td>
                    <td className="px-4 py-3 text-slate-600">{formatCentralDateTime(d.created_at)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500" title={d.sha256}>
                      {d.sha256.slice(0, 16)}...
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/documents/${d.id}`} className="text-sky-900 hover:underline">
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

function DocLink({ id, documents }: { id: string; documents: Array<{ id: string; file_name: string; kind: string }> }) {
  const doc = documents.find((d) => d.id === id);
  if (!doc) return null;
  const label = doc.kind === "executed agreement" ? "Download executed PDF" : "Download client-signed PDF";
  return (
    <a
      href={`/documents/${doc.id}`}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-sky-900 hover:bg-slate-100"
    >
      {label}
    </a>
  );
}
