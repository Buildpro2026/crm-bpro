import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { formatCentralDate } from "@/lib/time";
import { CANDIDATE_STATUSES, isCandidateStatus } from "@/lib/candidates";
import { CandidateStatusBadge } from "@/components/crm/badges";

export const metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q: rawQ, status: rawStatus } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);
  const status = rawStatus && isCandidateStatus(rawStatus) ? rawStatus : "";
  const { supabase } = await requireOwner();

  let query = supabase
    .from("candidates")
    .select("id, full_name, current_title, city, state, status, phone, agreement_signed_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (q) {
    const term = q.replace(/[%,()*\\]/g, " ");
    query = query.or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,current_title.ilike.%${term}%,desired_title.ilike.%${term}%,city.ilike.%${term}%`,
    );
  }
  if (status) query = query.eq("status", status);
  const { data: candidates, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-600">Everyone you represent, with their resumes, agreements, and history.</p>
        </div>
        <Link href="/candidates/new" className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900">
          New candidate
        </Link>
      </div>

      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search candidates
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name, title, phone, email, or city"
          className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select id="status" name="status" defaultValue={status} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
          <option value="">All statuses</option>
          {CANDIDATE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100">
          Filter
        </button>
        {q || status ? (
          <Link href="/candidates" className="self-center text-sm text-slate-600 hover:text-slate-900">
            Clear
          </Link>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Candidates could not be loaded: {error.message}. If this mentions a missing table, apply migration 0003.
        </p>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 md:table-cell">Title</th>
                <th className="hidden px-4 py-3 lg:table-cell">Location</th>
                <th className="hidden px-4 py-3 sm:table-cell">Agreement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/candidates/${c.id}`} className="font-medium text-sky-900 hover:underline">
                      {c.full_name}
                    </Link>
                    {c.phone ? <p className="text-xs text-slate-500">{c.phone}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <CandidateStatusBadge status={c.status} />
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{c.current_title ?? "-"}</td>
                  <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">
                    {[c.city, c.state].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {c.agreement_signed_at ? `Signed ${formatCentralDate(c.agreement_signed_at)}` : "Not signed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {q || status ? "No candidates match that filter." : "No candidates yet. Add your first candidate to start."}
        </div>
      ) : null}
    </div>
  );
}
