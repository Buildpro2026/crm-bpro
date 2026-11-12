"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction, type CreateKeyResult } from "@/app/(owner)/settings/api-keys/actions";
import { CopyButton } from "@/components/copy-button";

export function NewApiKey() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<CreateKeyResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await createApiKeyAction(name);
            setResult(r);
            if (r.ok) setName("");
          });
        }}
      >
        <label className="text-sm">
          <span className="block font-medium text-slate-800">Who will use this key?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="For example, Chad"
            className="mt-1 block w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create key"}
        </button>
      </form>

      {result && !result.ok ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}

      {result && result.ok ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-950">
            <span className="font-semibold">Key for {result.name} created.</span> Copy it now and paste it where the
            agent is set up (for Chad, the CRM_API_KEY setting on Render). It is shown only once and cannot be
            recovered. If it is lost, revoke it and create a new one.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={result.key}
              aria-label="New API key"
              onFocus={(e) => e.currentTarget.select()}
              className="block w-full rounded-md border border-amber-400 bg-white px-3 py-2 font-mono text-xs"
            />
            <CopyButton text={result.key} label="Copy key" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
