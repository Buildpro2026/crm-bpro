"use client";

import { useState, useTransition } from "react";
import { createSignatureRequestAction, type CreateSignatureRequestResult } from "@/app/(owner)/companies/signing-actions";
import { CopyButton } from "@/components/copy-button";
import { formatCentralDate } from "@/lib/time";

export type ContactOption = { id: string; name: string; title: string | null; email: string | null };

export function NewSignatureRequest({ companyId, contacts }: { companyId: string; contacts: ContactOption[] }) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [result, setResult] = useState<CreateSignatureRequestResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (contacts.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Add a contact to this company before creating a signature request.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setResult(await createSignatureRequestAction(companyId, contactId));
          });
        }}
      >
        <div className="flex-1">
          <label htmlFor="contact" className="block text-sm font-medium text-slate-800">
            Contact who will sign
          </label>
          <select
            id="contact"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.title ? `, ${c.title}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending || !contactId}
          className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create signing packet and link"}
        </button>
      </form>

      {result && !result.ok ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}

      {result && result.ok ? (
        <div className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <div>
            <p className="font-semibold text-emerald-900">Link created</p>
            <p className="mt-1 text-sm text-emerald-900">
              Copy the link now. For security it is shown only once. BuildPro stores only a hash of it, so it
              cannot be displayed again. If it is lost, revoke this request and create a new one.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={result.link}
              aria-label="Client signing link"
              className="block w-full rounded-md border border-emerald-400 bg-white px-3 py-2 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton text={result.link} label="Copy link" />
          </div>
          <p className="text-sm text-emerald-900">
            Valid until {formatCentralDate(result.expiresAt)} (Central Time), 14 days from creation.
          </p>
          <div className="space-y-2">
            <label htmlFor="email-text" className="block text-sm font-medium text-emerald-900">
              Email text to send from your own mailbox
            </label>
            <textarea
              id="email-text"
              readOnly
              rows={13}
              value={result.emailText}
              className="block w-full rounded-md border border-emerald-400 bg-white px-3 py-2 font-mono text-xs"
            />
            <CopyButton text={result.emailText} label="Copy email text" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
