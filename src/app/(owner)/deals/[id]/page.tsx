import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { isUuid } from "@/lib/records";
import { formatCentralDateTime } from "@/lib/time";
import { actionLabel } from "@/lib/signing/status";
import { DEAL_STAGES, formatIsoDate, formatUsd } from "@/lib/crm";
import { StageBadge } from "@/components/crm/badges";
import { NoteComposer } from "@/components/crm/note-composer";
import { NotesTimeline } from "@/components/crm/notes-timeline";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { TaskList } from "@/components/crm/task-list";
import { setDealStageFormAction } from "../../crm-actions";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();

  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) notFound();

  const [companyRes, contactRes, notesRes, tasksRes, auditRes] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", deal.company_id).maybeSingle(),
    deal.contact_id
      ? supabase.from("contacts").select("id, name, title, email, phone").eq("id", deal.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("notes").select("id, body, created_at, deal_id, contact_id").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, details, due_date, priority, status, company_id, deal_id")
      .eq("deal_id", id)
      .order("status")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("audit_log")
      .select("id, action, detail, created_at")
      .eq("company_id", deal.company_id)
      .eq("detail->>deal_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const company = companyRes.data;
  const contact = contactRes.data;
  const returnPath = `/deals/${id}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/deals" className="text-sm text-slate-600 hover:text-slate-900">
            Pipeline
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{deal.name}</h1>
            <StageBadge stage={deal.stage} />
          </div>
          {company ? (
            <Link href={`/companies/${company.id}`} className="text-sm text-sky-900 hover:underline">
              {company.name}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={setDealStageFormAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="stage" className="sr-only">
              Stage
            </label>
            <select
              id="stage"
              name="stage"
              defaultValue={deal.stage}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {DEAL_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
              Move
            </button>
          </form>
          <Link
            href={`/deals/${id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Edit deal
          </Link>
        </div>
      </div>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-3">
        <Fact label="Estimated fee" value={formatUsd(deal.estimated_value) || "Not set"} />
        <Fact label="Fee percentage" value={deal.fee_percent !== null ? `${Number(deal.fee_percent)}%` : "Not set"} />
        <Fact label="Expected close" value={formatIsoDate(deal.expected_close_date) || "Not set"} />
        <Fact label="Position" value={deal.position_title ?? "Not set"} />
        <Fact label="Openings" value={String(deal.positions_count)} />
        <Fact
          label="Main contact"
          value={contact ? [contact.name, contact.title, contact.email, contact.phone].filter(Boolean).join(", ") : "None"}
        />
        {deal.closed_at ? <Fact label="Closed" value={formatCentralDateTime(deal.closed_at)} /> : null}
        {deal.lost_reason ? <Fact label="Lost reason" value={deal.lost_reason} /> : null}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <TaskQuickAdd companyId={deal.company_id} dealId={id} returnPath={returnPath} />
          </div>
          <TaskList tasks={tasksRes.data ?? []} returnPath={returnPath} emptyText="No tasks for this deal." />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <NoteComposer companyId={deal.company_id} dealId={id} returnPath={returnPath} />
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
                {typeof e.detail?.summary === "string" ? <span className="text-slate-500">{e.detail.summary}</span> : null}
                {typeof e.detail?.title === "string" ? <span className="text-slate-500">{e.detail.title}</span> : null}
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
      <p className="text-slate-800">{value}</p>
    </div>
  );
}
