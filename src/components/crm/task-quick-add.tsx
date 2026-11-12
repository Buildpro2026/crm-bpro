"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTaskAction } from "@/app/(owner)/crm-actions";
import { TASK_PRIORITIES } from "@/lib/crm";

type Props = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  candidateId?: string | null;
  returnPath: string;
  // Optional company picker for standalone tasks (the Tasks page).
  companies?: ReadonlyArray<{ id: string; name: string }>;
};

const input =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-500";

export function TaskQuickAdd({ companyId, contactId, dealId, candidateId, returnPath, companies }: Props) {
  const [state, formAction, pending] = useActionState(createTaskAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok, state?.savedAt]);

  const values = state?.ok ? {} : (state?.values ?? {});
  const errors = state?.fieldErrors ?? {};

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {companyId ? <input type="hidden" name="company_id" value={companyId} /> : null}
      {contactId ? <input type="hidden" name="contact_id" value={contactId} /> : null}
      {dealId ? <input type="hidden" name="deal_id" value={dealId} /> : null}
      {candidateId ? <input type="hidden" name="candidate_id" value={candidateId} /> : null}
      <input type="hidden" name="return_path" value={returnPath} />

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label htmlFor="task-title" className="sr-only">
            Task
          </label>
          <input
            id="task-title"
            name="title"
            maxLength={300}
            placeholder="New task, for example: Follow up on proposal"
            defaultValue={values.title ?? ""}
            aria-invalid={errors.title ? true : undefined}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="task-due" className="sr-only">
            Due date
          </label>
          <input
            id="task-due"
            name="due_date"
            type="date"
            defaultValue={values.due_date ?? ""}
            aria-invalid={errors.due_date ? true : undefined}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="task-priority" className="sr-only">
            Priority
          </label>
          <select id="task-priority" name="priority" defaultValue={values.priority || "normal"} className={input}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} priority
              </option>
            ))}
          </select>
        </div>
      </div>

      {companies && companies.length > 0 ? (
        <div>
          <label htmlFor="task-company" className="sr-only">
            Company
          </label>
          <select id="task-company" name="company_id" defaultValue="" className={input}>
            <option value="">No company (general task)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {state?.error ? (
        <p role="alert" className="text-sm text-red-700">
          {[state.error, ...Object.values(errors)].join(" ")}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Add task"}
      </button>
    </form>
  );
}
