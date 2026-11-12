import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// Branded frame for the client signing pages. No login, and no BuildPro email
// address appears here or anywhere in the generated documents.
export default function SignLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b-4 border-sky-900 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-2 px-4 py-4 sm:px-6">
          <div>
            <p className="text-lg font-bold tracking-wide text-sky-950">BUILDPRO RECRUITERS, LLC</p>
            <p className="text-xs uppercase tracking-widest text-slate-500">Executive search and recruiting</p>
          </div>
          <div className="text-right text-sm text-slate-700">
            <p>214-238-5145</p>
            <p>buildprorecruiters.com</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
