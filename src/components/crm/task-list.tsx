import Link from "next/link";
import { deleteTaskAction, toggleTaskAction } from "@/app/(owner)/crm-actions";
import { centralToday, formatIsoDate, taskBucket } from "@/lib/crm";

export type TaskRow = {
  id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  company_id: string | null;
  deal_id: string | null;
};

type Props = {
  tasks: readonly TaskRow[];
  returnPath: string;
  companyNames?: ReadonlyMap<string, string>;
  dealNames?: ReadonlyMap<string, string>;
  emptyText?: string;
};

const DUE_STYLE: Record<string, string> = {
  overdue: "text-red-700 font-semibold",
  today: "text-amber-800 font-semibold",
  "this week": "text-slate-700",
  later: "text-slate-500",
  "no date": "text-slate-400",
  done: "text-slate-400",
};

export function TaskList({ tasks, returnPath, companyNames, dealNames, emptyText }: Props) {
  if (tasks.length === 0) {
    return <p className="text-sm text-slate-600">{emptyText ?? "No tasks."}</p>;
  }
  const today = centralToday();
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
      {tasks.map((t) => {
        const bucket = taskBucket(t, today);
        const done = t.status === "done";
        const company = t.company_id ? companyNames?.get(t.company_id) : undefined;
        const deal = t.deal_id ? dealNames?.get(t.deal_id) : undefined;
        return (
          <li key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
            <form action={toggleTaskAction}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="return_path" value={returnPath} />
              <button
                type="submit"
                aria-label={done ? `Reopen task: ${t.title}` : `Mark done: ${t.title}`}
                title={done ? "Reopen" : "Mark done"}
                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${
                  done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white hover:border-sky-700"
                }`}
              >
                {done ? "✓" : ""}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                {t.priority === "high" && !done ? (
                  <span className="mr-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                    High
                  </span>
                ) : null}
                {t.title}
              </p>
              {t.details ? <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{t.details}</p> : null}
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                <span className={DUE_STYLE[bucket]}>
                  {t.due_date
                    ? `${bucket === "overdue" ? "Overdue: " : bucket === "today" ? "Due today: " : "Due "}${formatIsoDate(t.due_date)}`
                    : "No due date"}
                </span>
                {company && t.company_id ? (
                  <Link href={`/companies/${t.company_id}`} className="text-sky-900 hover:underline">
                    {company}
                  </Link>
                ) : null}
                {deal && t.deal_id ? (
                  <Link href={`/deals/${t.deal_id}`} className="text-sky-900 hover:underline">
                    Deal: {deal}
                  </Link>
                ) : null}
              </p>
            </div>
            <form action={deleteTaskAction}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="return_path" value={returnPath} />
              <button type="submit" className="text-xs text-slate-400 hover:text-red-700" aria-label={`Delete task: ${t.title}`}>
                Delete
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
