import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { formatUsd, OPEN_DEAL_STAGES, sumValues } from "@/lib/crm";
import { PipelineBoard, type BoardDeal } from "@/components/crm/pipeline-board";

export const metadata = { title: "Deals" };
export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const { supabase } = await requireOwner();
  const [dealsRes, companiesRes] = await Promise.all([
    supabase
      .from("deals")
      .select("id, name, company_id, stage, estimated_value, expected_close_date, position_title, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("companies").select("id, name"),
  ]);
  const companyName = new Map((companiesRes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const deals: BoardDeal[] = (dealsRes.data ?? []).map((d) => ({
    ...d,
    company_name: companyName.get(d.company_id) ?? "Unknown company",
  }));
  const open = deals.filter((d) => (OPEN_DEAL_STAGES as readonly string[]).includes(d.stage));
  const boardKey = deals.map((d) => `${d.id}:${d.stage}`).join("|");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Deals pipeline</h1>
          <p className="text-sm text-slate-600">
            {open.length} open {open.length === 1 ? "deal" : "deals"}
            {open.length > 0 ? `, ${formatUsd(sumValues(open))} in estimated fees` : ""}. Drag a card to change its stage.
          </p>
        </div>
        <Link href="/deals/new" className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900">
          New deal
        </Link>
      </div>

      {dealsRes.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Deals could not be loaded: {dealsRes.error.message}. If this mentions a missing table, apply migration 0002.
        </p>
      ) : null}

      {deals.length === 0 && !dealsRes.error ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No deals yet. Create one to start tracking a client opportunity through the pipeline.
        </div>
      ) : null}

      <PipelineBoard key={boardKey} deals={deals} />
    </div>
  );
}
