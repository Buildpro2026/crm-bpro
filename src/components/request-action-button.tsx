"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionResult = { ok: true } | { ok: false; error: string };

export function RequestActionButton({
  requestId,
  label,
  confirmText,
  action,
  tone = "neutral",
}: {
  requestId: string;
  label: string;
  confirmText: string;
  action: (requestId: string) => Promise<ActionResult>;
  tone?: "neutral" | "danger" | "primary";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toneClass =
    tone === "danger"
      ? "border-red-300 text-red-800 hover:bg-red-50"
      : tone === "primary"
        ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
        : "border-slate-300 text-slate-800 hover:bg-slate-100";

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          setError(null);
          startTransition(async () => {
            const result = await action(requestId);
            if (!result.ok) setError(result.error);
            router.refresh();
          });
        }}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${toneClass}`}
      >
        {pending ? "Working..." : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
