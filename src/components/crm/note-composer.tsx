"use client";

import { useActionState, useEffect, useRef } from "react";
import { addNoteAction } from "@/app/(owner)/crm-actions";

type Props = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  candidateId?: string | null;
  returnPath: string;
  placeholder?: string;
};

export function NoteComposer({ companyId, contactId, dealId, candidateId, returnPath, placeholder }: Props) {
  const [state, formAction, pending] = useActionState(addNoteAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok, state?.savedAt]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {companyId ? <input type="hidden" name="company_id" value={companyId} /> : null}
      {contactId ? <input type="hidden" name="contact_id" value={contactId} /> : null}
      {dealId ? <input type="hidden" name="deal_id" value={dealId} /> : null}
      {candidateId ? <input type="hidden" name="candidate_id" value={candidateId} /> : null}
      <input type="hidden" name="return_path" value={returnPath} />
      <label htmlFor="note-body" className="sr-only">
        New note
      </label>
      <textarea
        id="note-body"
        name="body"
        rows={3}
        maxLength={10000}
        defaultValue={state?.ok ? "" : (state?.values?.body ?? "")}
        placeholder={placeholder ?? "Log a call, meeting, or update..."}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Add note"}
      </button>
    </form>
  );
}
