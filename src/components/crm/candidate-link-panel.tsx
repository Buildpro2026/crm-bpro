"use client";

import { useState, useTransition } from "react";
import { createCandidateLinkAction, type CandidateLinkResult } from "@/app/(owner)/candidates/actions";
import { CopyButton } from "@/components/copy-button";
import { formatCentralDate } from "@/lib/time";

export function CandidateLinkPanel({ candidateId }: { candidateId: string }) {
  const [result, setResult] = useState<CandidateLinkResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await createCandidateLinkAction(candidateId)))}
        className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create candidate agreement link"}
      </button>

      {result && !result.ok ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}

      {result && result.ok ? (
        <div className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            <span className="font-semibold">Link created.</span> Copy it now: for security it is shown only once. The
            candidate&apos;s details are already filled in on the form.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={result.link}
              aria-label="Candidate agreement link"
              className="block w-full rounded-md border border-emerald-400 bg-white px-3 py-2 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton text={result.link} label="Copy link" />
          </div>
          <p className="text-sm text-emerald-900">Valid until {formatCentralDate(result.expiresAt)} (Central Time).</p>
          <div className="space-y-2">
            <label htmlFor="candidate-email-text" className="block text-sm font-medium text-emerald-900">
              Email or text message to send
            </label>
            <textarea
              id="candidate-email-text"
              readOnly
              rows={12}
              value={result.emailText}
              className="block w-full rounded-md border border-emerald-400 bg-white px-3 py-2 font-mono text-xs"
            />
            <CopyButton text={result.emailText} label="Copy message" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
