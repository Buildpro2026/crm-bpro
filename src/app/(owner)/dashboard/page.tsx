import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { formatCentralDateTime } from "@/lib/time";
import { actionLabel } from "@/lib/signing/status";
import {
  addDaysToIsoDate,
  centralToday,
  DEAL_STAGES,
  formatUsd,
  OPEN_DEAL_STAGES,
  sumValues,
} from "@/lib/crm";
import { TaskList, type TaskRow } from "@/components/crm/task-list";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireOwner();
  const today = centralToday();
  const weekAhead = addDaysToIsoDate(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [dealsRes, tasksRes, companiesRes, contactsCountRes, auditRes] = await Promise.all([
    supabase.from("deals").select("id, name, stage, estimated_value, closed_at, company_id"),
    supabase
      .from("tasks")
      .select("id, title, details, due_date, priority, status, company_id, deal_id")
      .eq("status", "open")
      .or(`due_date.lte.${weekAhead},due_date.is.null`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase.from("companies").select("id, name, status"),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("audit_log").select("id, action, company_id, detail, created_at").order("created_at", { ascending: false }).limit(12),
  ]);

  const deals = dealsRes.data ?? [];
  const companies = companiesRes.data ?? [];
  const companyNames = new Map(companies.map((c) => [c.id as string, c.name as string]));
  const dealNames = new Map(deals.map((d) => [d.id as string, d.name as string]));
  const openDeals = deals.filter((d) => (OPEN_DEAL_STAGES as readonly string[]).includes(d.stage));
  const wonThisMonth = deals.filter((d) => d.stage === "won" && d.closed_at && d.closed_at.slice(0, 10) >= monthStart);
  const tasks: TaskRow[] = (tasksRes.data ?? []).filter((t) => t.due_date !== null);
  const overdue = tasks.filter((t) => t.due_date! < today).length;
  const dueToday = tasks.filter((t) => t.due_date === today).length;
  const activeClients = companies.filter((c) => c.status === "active client").length;
  const setupMissing = Boolean(dealsRes.error || tasksRes.error);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back, {profile.full_name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-600">Here is where BuildPro stands today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/companies/new">New company</QuickLink>
          <QuickLink href="/candidates/new">New candidate</QuickLink>
          <QuickLink href="/deals/new">New deal</QuickLink>
          <QuickLink href="/tasks">New task</QuickLink>
        </div>
      </div>

      {setupMissing ? (
        <p role="alert" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Deals and tasks are not available yet. Apply migration 0002 in the Supabase SQL Editor, then refresh.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open pipeline" value={formatUsd(sumValues(openDeals)) || "$0"} sub={`${openDeals.length} open deals`} href="/deals" />
        <Stat
          label="Won this month"
          value={formatUsd(sumValues(wonThisMonth)) || "$0"}
          sub={`${wonThisMonth.length} deals`}
          href="/deals"
        />
        <Stat
          label="Tasks due"
          value={String(overdue + dueToday)}
          sub={overdue > 0 ? `${overdue} overdue, ${dueToday} today` : `${dueToday} today`}
          href="/tasks"
          alert={overdue > 0}
        />
        <Stat
          label="Companies"
          value={String(companies.length)}
          sub={`${activeClients} active clients, ${contactsCountRes.count ?? 0} contacts`}
          href="/companies"
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Due in the next 7 days</h2>
            <Link href="/tasks" className="text-sm text-sky-900 hover:underline">
              All tasks
            </Link>
          </div>
          <TaskList
            tasks={tasks}
            returnPath="/dashboard"
            companyNames={companyNames}
            dealNames={dealNames}
            emptyText="Nothing due this week."
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Pipeline by stage</h2>
            <Link href="/deals" className="text-sm text-sky-900 hover:underline">
              Open board
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
            {DEAL_STAGES.filter((s) => s.value !== "lost").map((s) => {
              const inStage = deals.filter((d) => d.stage === s.value);
              return (
                <li key={s.value} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-700">{s.label}</span>
                  <span className="text-slate-500">
                    <span className="font-semibold text-slate-800">{inStage.length}</span>
                    {inStage.length > 0 ? `  |  ${formatUsd(sumValues(inStage))}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          <h2 className="pt-4 text-lg font-semibold text-slate-900">Recent activity</h2>
          {(auditRes.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-600">No activity yet.</p>
          ) : (
            <ol className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
              {(auditRes.data ?? []).map((e) => (
                <li key={e.id} className="flex flex-col">
                  <span className="text-slate-800">
                    {actionLabel(e.action)}
                    {e.company_id && companyNames.get(e.company_id) ? (
                      <>
                        {" at "}
                        <Link href={`/companies/${e.company_id}`} className="text-sky-900 hover:underline">
                          {companyNames.get(e.company_id)}
                        </Link>
                      </>
                    ) : null}
                  </span>
                  <span className="text-xs text-slate-500">{formatCentralDateTime(e.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  href,
  alert,
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </Link>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
      {children}
    </Link>
  );
}
