import Link from "next/link";
import { requireOwner } from "@/lib/owner";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);
  const { supabase } = await requireOwner();

  let query = supabase.from("contacts").select("id, name, title, email, phone, company_id").order("name").limit(500);
  if (q) {
    // Strip characters that have meaning in a PostgREST or() filter.
    const term = q.replace(/[%,()*\\]/g, " ");
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,title.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const [contactsRes, companiesRes] = await Promise.all([query, supabase.from("companies").select("id, name")]);
  const contacts = contactsRes.data ?? [];
  const companyName = new Map((companiesRes.data ?? []).map((c) => [c.id as string, c.name as string]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
        <p className="text-sm text-slate-600">Everyone you work with at client companies. Add contacts from a company page.</p>
      </div>

      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search contacts
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name, email, title, or phone"
          className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100">
          Search
        </button>
        {q ? (
          <Link href="/contacts" className="self-center text-sm text-slate-600 hover:text-slate-900">
            Clear
          </Link>
        ) : null}
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {q ? "No contacts match that search." : "No contacts yet. Open a company and click Add contact."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="hidden px-4 py-3 md:table-cell">Title</th>
                <th className="hidden px-4 py-3 sm:table-cell">Email</th>
                <th className="hidden px-4 py-3 lg:table-cell">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.company_id}/contacts/${c.id}/edit`} className="font-medium text-sky-900 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.company_id}`} className="text-slate-700 hover:underline">
                      {companyName.get(c.company_id) ?? "-"}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{c.title ?? "-"}</td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="hover:underline">
                        {c.phone}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
