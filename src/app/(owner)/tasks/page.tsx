import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { centralToday, taskBucket, type TaskBucket } from "@/lib/crm";
import { TaskQuickAdd } from "@/components/crm/task-quick-add";
import { TaskList, type TaskRow } from "@/components/crm/task-list";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { value: "open", label: "Open" },
  { value: "done", label: "Completed" },
] as const;

const GROUPS: ReadonlyArray<{ bucket: TaskBucket; label: string }> = [
  { bucket: "overdue", label: "Overdue" },
  { bucket: "today", label: "Due today" },
  { bucket: "this week", label: "Next 7 days" },
  { bucket: "later", label: "Later" },
  { bucket: "no date", label: "No due date" },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view = rawView === "done" ? "done" : "open";
  const { supabase } = await requireOwner();

  const [tasksRes, companiesRes, dealsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, details, due_date, priority, status, company_id, deal_id, completed_at")
      .eq("status", view)
      .order(view === "done" ? "completed_at" : "due_date", { ascending: view !== "done", nullsFirst: false })
      .limit(500),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("deals").select("id, name"),
  ]);

  const tasks: TaskRow[] = tasksRes.data ?? [];
  const companies = companiesRes.data ?? [];
  const companyNames = new Map(companies.map((c) => [c.id as string, c.name as string]));
  const dealNames = new Map((dealsRes.data ?? []).map((d) => [d.id as string, d.name as string]));
  const today = centralToday();
  const priorityRank: Record<string, number> = { high: 0, normal: 1, low: 2 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-600">Follow-ups and to-dos across all companies and deals.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <TaskQuickAdd returnPath="/tasks" companies={companies} />
      </div>

      <nav className="flex gap-2 text-sm" aria-label="Task views">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={v.value === "open" ? "/tasks" : "/tasks?view=done"}
            aria-current={view === v.value ? "page" : undefined}
            className={`rounded-full px-3 py-1 ${
              view === v.value ? "bg-sky-800 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {tasksRes.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Tasks could not be loaded: {tasksRes.error.message}. If this mentions a missing table, apply migration 0002.
        </p>
      ) : null}

      {view === "done" ? (
        <TaskList
          tasks={tasks}
          returnPath="/tasks?view=done"
          companyNames={companyNames}
          dealNames={dealNames}
          emptyText="No completed tasks yet."
        />
      ) : tasks.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing open. Add a task above.</p>
      ) : (
        GROUPS.map((g) => {
          const group = tasks
            .filter((t) => taskBucket(t, today) === g.bucket)
            .sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1));
          if (group.length === 0) return null;
          return (
            <section key={g.bucket} className="space-y-2">
              <h2
                className={`text-sm font-semibold uppercase tracking-wide ${
                  g.bucket === "overdue" ? "text-red-700" : "text-slate-600"
                }`}
              >
                {g.label} ({group.length})
              </h2>
              <TaskList tasks={group} returnPath="/tasks" companyNames={companyNames} dealNames={dealNames} />
            </section>
          );
        })
      )}
    </div>
  );
}
