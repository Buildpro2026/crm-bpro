import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { formatCentralDate } from "@/lib/time";
import { COMPANY_STATUSES, isCompanyStatus } from "@/lib/crm";
import { CompanyStatusBadge } from "@/components/crm/badges";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q: rawQ, status: rawStatus } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);
  const status = rawStatus && isCompanyStatus(rawStatus) ? rawStatus : "";
  const { supabase } = await requireOwner();

  let query = supabase
    .from("companies")
    .select("id, name, industry, hq_city, hq_state, status, updated_at")
    .order("name", { ascending: true });
  if (q) {
    const term = q.replace(/[%,()*\\]/g, " ");
    query = query.or(`name.ilike.%${term}%,industry.ilike.%${term}%,hq_city.ilike.%${term}%`);
  }
  if (status) query = query.eq("status", status);
  const { data: companies, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-600">Prospects and clients, with their contacts, deals, and signed agreements.</p>
        </div>
        <Link href="/companies/new" className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900">
          New company
        </Link>
      </div>

      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search companies
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name, industry, or city"
          className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="">All statuses</option>
          {COMPANY_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100">
          Filter
        </button>
        {q || status ? (
          <Link href="/companies" className="self-center text-sm text-slate-600 hover:text-slate-900">
            Clear
          </Link>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Companies could not be loaded: {error.message}. If this mentions a missing column, apply migration 0002.
        </p>
      ) : null}

      {companies && companies.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 sm:table-cell">Industry</th>
                <th className="hidden px-4 py-3 md:table-cell">Headquarters</th>
                <th className="hidden px-4 py-3 sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.id}`} className="font-medium text-sky-900 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <CompanyStatusBadge status={c.status} />
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{c.industry ?? "-"}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {[c.hq_city, c.hq_state].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{formatCentralDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {q || status ? "No companies match that filter." : "No companies yet. Add your first prospect or client to start."}
        </div>
      ) : null}
    </div>
  );
}
