import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { formatCentralDate } from "@/lib/time";

export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const { supabase } = await requireOwner();
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, industry, hq_city, hq_state, updated_at")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-600">Client companies, their contacts, and their signed agreements.</p>
        </div>
        <Link
          href="/companies/new"
          className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900"
        >
          New company
        </Link>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Companies could not be loaded: {error.message}
        </p>
      ) : null}

      {companies && companies.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="hidden px-4 py-3 sm:table-cell">Industry</th>
                <th className="hidden px-4 py-3 md:table-cell">Headquarters</th>
                <th className="px-4 py-3">Updated</th>
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
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{c.industry ?? "-"}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {[c.hq_city, c.hq_state].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatCentralDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No companies yet. Add your first client company to start.
        </div>
      )}
    </div>
  );
}
