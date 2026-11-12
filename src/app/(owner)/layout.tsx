import Link from "next/link";
import { requireOwner } from "@/lib/owner";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/companies", label: "Companies" },
  { href: "/contacts", label: "Contacts" },
  { href: "/candidates", label: "Candidates" },
  { href: "/deals", label: "Deals" },
  { href: "/tasks", label: "Tasks" },
] as const;

export default async function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const owner = await requireOwner();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold tracking-wide text-sky-900">
              BUILDPRO CRM
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm text-slate-600">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-slate-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="hidden sm:inline">{owner.profile.full_name}</span>
            <form action="/logout" method="post">
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
