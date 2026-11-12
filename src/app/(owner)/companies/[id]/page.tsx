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
import { CompanyStatusBadge, StageBadge } from "@/components/crm/badges";
import { NoteComposer } from "@/components/crm/note-composer";
import { NotesTimeline } from "@/components/crm/notes-timeline";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { TaskList } from "@/components/crm/task-list";
import { formatIsoDate, formatUsd } from "@/lib/crm";
import { COMPANY_FOLDERS } from "@/lib/files";
import { FilesPanel } from "@/components/crm/files-panel";
import { generateAboutBuildProAction } from "../../file-actions";
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

  const [contactsRes, documentsRes, requestsRes, auditRes, dealsRes, notesRes, tasksRes] = await Promise.all([
    supabase.from("contacts").select("*").eq("company_id", id).order("name"),
    supabase.from("documents").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("signature_requests").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_log").select("*").eq("company_id", id).order("created_at", { ascending: true }).limit(1000),
    supabase
      .from("deals")
      .select("id, name, stage, estimated_value, expected_close_date, position_title")
      .eq("company_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("notes")
      .select("id, body, created_at, deal_id, contact_id")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("tasks")
      .select("id, title, details, due_date, priority, status, company_id, deal_id")
      .eq("company_id", id)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  const deals = dealsRes.data ?? [];
  const dealNames = new Map(deals.map((d) => [d.id as string, d.name as string]));
  const returnPath = `/companies/${id}`;
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
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{company.name}</h1>
            <CompanyStatusBadge status={company.status} />
          </div>
          <p className="text-sm text-slate-600">
            {[company.industry, [company.hq_city, company.hq_state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join("  |  ") || "No industry or location yet"}
          </p>
          <p className="flex flex-wrap gap-x-4 text-sm">
            {company.phone ? (
              <a href={`tel:${company.phone}`} className="text-sky-900 hover:underline">
                {company.phone}
              </a>
            ) : null}
            {company.website ? <span className="text-sky-900">{company.website}</span> : null}
            {company.source ? <span className="text-slate-500">Source: {company.source}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/deals/new?company=${id}`}
            className="rounded-md bg-sky-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-900"
          >
            New deal
          </Link>
          <Link
            href={`/companies/${id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Edit company
          </Link>
        </div>
      </div>

      {company.notes ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Background</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{company.notes}</p>
        </section>
      ) : null}

      {/* Deals */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Deals</h2>
          <Link href={`/deals/new?company=${id}`} className="text-sm text-sky-900 hover:underline">
            Add deal
          </Link>
        </div>
        {deals.length === 0 ? (
          <p className="text-sm text-slate-600">No deals yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
            {deals.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <Link href={`/deals/${d.id}`} className="font-medium text-sky-900 hover:underline">
                    {d.name}
                  </Link>
                  <p className="text-slate-600">
                    {[d.position_title, formatUsd(d.estimated_value), d.expected_close_date ? `Close ${formatIsoDate(d.expected_close_date)}` : ""]
                      .filter(Boolean)
                      .join("  |  ") || "No details"}
                  </p>
                </div>
                <StageBadge stage={d.stage} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tasks and notes */}
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Open tasks</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <TaskQuickAdd companyId={id} returnPath={returnPath} />
          </div>
          <TaskList tasks={tasksRes.data ?? []} returnPath={returnPath} dealNames={dealNames} emptyText="No open tasks." />
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <NoteComposer companyId={id} returnPath={returnPath} />
          </div>
          <NotesTimeline
            notes={notesRes.data ?? []}
            returnPath={returnPath}
            dealNames={dealNames}
            contactNames={new Map(contacts.map((c) => [c.id as string, c.name as string]))}
          />
        </section>
      </div>

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

      {/* Files */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Files</h2>
            <p className="text-sm text-slate-600">
              Signed agreements file themselves here automatically. Upload anything else into a folder.
            </p>
          </div>
          <form action={generateAboutBuildProAction}>
            <input type="hidden" name="company_id" value={id} />
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
              Auto-fill &ldquo;About BuildPro Recruiters&rdquo; PDF
            </button>
          </form>
        </div>
        <FilesPanel files={documents} folders={COMPANY_FOLDERS} companyId={id} />
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
