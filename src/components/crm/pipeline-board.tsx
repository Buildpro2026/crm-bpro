"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveDealStageAction } from "@/app/(owner)/crm-actions";
import { DEAL_STAGES, formatIsoDate, formatUsd, type DealStage } from "@/lib/crm";

export type BoardDeal = {
  id: string;
  name: string;
  company_id: string;
  company_name: string;
  stage: string;
  estimated_value: number | string | null;
  expected_close_date: string | null;
  position_title: string | null;
};

const COLUMN_ACCENT: Record<DealStage, string> = {
  "new lead": "border-t-slate-400",
  contacted: "border-t-sky-500",
  "discovery meeting": "border-t-indigo-500",
  "proposal sent": "border-t-violet-500",
  "agreement sent": "border-t-amber-500",
  won: "border-t-emerald-500",
  lost: "border-t-zinc-400",
};

export function PipelineBoard({ deals: initial }: { deals: readonly BoardDeal[] }) {
  const [deals, setDeals] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function move(dealId: string, stage: DealStage) {
    const current = deals.find((d) => d.id === dealId);
    if (!current || current.stage === stage) return;
    const previous = current.stage;
    setError(null);
    setDeals((all) => all.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    startTransition(async () => {
      const result = await moveDealStageAction(dealId, stage);
      if (!result.ok) {
        setDeals((all) => all.map((d) => (d.id === dealId ? { ...d, stage: previous } : d)));
        setError(result.error ?? "The deal could not be moved.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-3">
          {DEAL_STAGES.map((stage) => {
            const column = deals.filter((d) => d.stage === stage.value);
            const total = column.reduce((sum, d) => sum + (Number(d.estimated_value) || 0), 0);
            const isOver = overStage === stage.value;
            return (
              <section
                key={stage.value}
                aria-label={`${stage.label} column`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.value);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.value ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  setOverStage(null);
                  setDragId(null);
                  if (id) move(id, stage.value);
                }}
                className={`flex w-64 shrink-0 flex-col rounded-lg border border-t-4 border-slate-200 bg-slate-100/70 ${
                  COLUMN_ACCENT[stage.value]
                } ${isOver ? "ring-2 ring-sky-400" : ""}`}
              >
                <header className="px-3 pb-2 pt-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">{stage.label}</h2>
                    <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-600">{column.length}</span>
                  </div>
                  <p className="text-xs text-slate-500">{total > 0 ? formatUsd(total) : " "}</p>
                </header>
                <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
                  {column.map((d) => (
                    <li
                      key={d.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", d.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(d.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`cursor-grab rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing ${
                        dragId === d.id ? "opacity-50" : ""
                      }`}
                    >
                      <Link href={`/deals/${d.id}`} className="font-medium text-sky-900 hover:underline">
                        {d.name}
                      </Link>
                      <p className="text-xs text-slate-600">{d.company_name}</p>
                      {d.position_title ? <p className="text-xs text-slate-500">{d.position_title}</p> : null}
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{formatUsd(d.estimated_value)}</span>
                        <span>{d.expected_close_date ? `Close ${formatIsoDate(d.expected_close_date)}` : ""}</span>
                      </div>
                      <label className="mt-2 block">
                        <span className="sr-only">Move {d.name} to stage</span>
                        <select
                          value={d.stage}
                          onChange={(e) => move(d.id, e.target.value as DealStage)}
                          className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-600"
                        >
                          {DEAL_STAGES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
