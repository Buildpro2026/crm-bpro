import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { isUuid } from "@/lib/records";
import { formatCentralDateTime } from "@/lib/time";
import { actionLabel } from "@/lib/signing/status";
import { formatUsd } from "@/lib/crm";
import { CANDIDATE_FOLDERS } from "@/lib/files";
import { CandidateStatusBadge } from "@/components/crm/badges";
import { CandidateLinkPanel } from "@/components/crm/candidate-link-panel";
import { FilesPanel } from "@/components/crm/files-panel";
import { NoteComposer } from "@/components/crm/note-composer";
import { NotesTimeline } from "@/components/crm/notes-timeline";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { TaskList } from "@/components/crm/task-list";
import { revokeCandidateLinkAction } from "../actions";

export const dynamic = "force-dynamic";

const AGREEMENT_STATUS: Record<string, string> = {
  created: "Sent, not opened",
  viewed: "Opened, not signed",
  signed: "Signed",
  expired: "Expired",
  revoked: "Revoked",
};

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const { data: c } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const [filesRes, notesRes, tasksRes, agreementsRes, auditRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, file_name, folder, kind, size_bytes, created_at")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("notes").select("id, body, created_at, deal_id, contact_id").eq("candidate_id", id).order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, details, due_date, priority, status, company_id, deal_id")
      .eq("candidate_id", id)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_agreements")
      .select("id, status, created_at, expires_at, signed_at, signed_document_id")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("audit_log").select("id, action, created_at, ip_address").eq("candidate_id", id).order("created_at", { ascending: false }).limit(100),
  ]);

  const returnPath = `/candidates/${id}`;
  const agreements = agreementsRes.data ?? [];
  const now = new Date();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/candidates" className="text-sm text-slate-600 hover:text-slate-900">
            All candidates
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{c.full_name}</h1>
            <CandidateStatusBadge status={c.status} />
            {c.agreement_signed_at ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-300">
                Agreement signed
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            {[c.current_title, c.current_employer, [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join("  |  ") ||
              "No title or location yet"}
          </p>
          <p className="flex flex-wrap gap-x-4 text-sm">
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="text-sky-900 hover:underline">
                {c.phone}
              </a>
            ) : null}
            {c.email ? (
              <a href={`mailto:${c.email}`} className="text-sky-900 hover:underline">
                {c.email}
              </a>
            ) : null}
            {c.linkedin_url ? (
              <a
                href={/^https?:\/\//.test(c.linkedin_url) ? c.linkedin_url : `https://${c.linkedin_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-900 hover:underline"
              >
                LinkedIn
              </a>
            ) : null}
          </p>
        </div>
        <Link
          href={`/candidates/${id}/edit`}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
        >
          Edit candidate
        </Link>
      </div>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-3">
        <Fact label="Desired title" value={c.desired_title ?? "Not set"} />
        <Fact label="Desired salary" value={formatUsd(c.desired_salary) || "Not set"} />
        <Fact label="Source" value={c.source ?? "Not set"} />
        <Fact label="Texts allowed" value={c.text_opt_in === null ? "Not asked yet" : c.text_opt_in ? "Yes" : "No"} />
        <Fact label="Recent submissions (last 6 months)" value={c.recent_submissions ?? "Not provided yet"} />
        {c.background ? <Fact label="Background" value={c.background} /> : null}
      </section>

      {/* Candidate agreement */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Candidate Representation Agreement</h2>
          <p className="text-sm text-slate-600">
            Creates a one-time link. The candidate sees their details already filled in, confirms them, and signs
            online. The signed PDF is filed in the Agreements folder below and their record is updated.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <CandidateLinkPanel candidateId={id} />
        </div>
        {agreements.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
            {agreements.map((a) => {
              const expired = (a.status === "created" || a.status === "viewed") && new Date(a.expires_at) <= now;
              const label = expired ? "Expired" : (AGREEMENT_STATUS[a.status] ?? a.status);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-medium text-slate-900">{label}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      Created {formatCentralDateTime(a.created_at)}
                      {a.signed_at ? `, signed ${formatCentralDateTime(a.signed_at)}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {a.signed_document_id ? (
                      <a href={`/documents/${a.signed_document_id}`} className="text-sky-900 hover:underline">
                        Download signed PDF
                      </a>
                    ) : null}
                    {(a.status === "created" || a.status === "viewed") && !expired ? (
                      <form action={revokeCandidateLinkAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="candidate_id" value={id} />
                        <button type="submit" className="text-xs text-red-700 hover:underline">
                          Revoke link
                        </button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* Files */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Files</h2>
        <FilesPanel files={filesRes.data ?? []} folders={CANDIDATE_FOLDERS} candidateId={id} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Open tasks</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <TaskQuickAdd candidateId={id} returnPath={returnPath} />
          </div>
          <TaskList tasks={tasksRes.data ?? []} returnPath={returnPath} emptyText="No open tasks." />
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <NoteComposer candidateId={id} returnPath={returnPath} placeholder="Log a screening call, interview feedback, or update..." />
          </div>
          <NotesTimeline notes={notesRes.data ?? []} returnPath={returnPath} />
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Activity</h2>
        {(auditRes.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">No activity yet.</p>
        ) : (
          <ol className="space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
            {(auditRes.data ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 text-slate-700">
                <span className="font-mono text-xs text-slate-500">{formatCentralDateTime(e.created_at)}</span>
                <span className="font-medium">{actionLabel(e.action)}</span>
                {e.ip_address ? <span className="text-xs text-slate-500">IP {e.ip_address}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap text-slate-800">{value}</p>
    </div>
  );
}
