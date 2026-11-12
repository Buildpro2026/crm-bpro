import { getRequestContext } from "@/lib/request-context";
import { recordCandidateView, resolveCandidateLink } from "@/lib/candidates/agreement-service";
import { CandidateSigningForm } from "@/components/sign/candidate-signing-form";
import { formatCentralDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Candidate agreement" };

export default async function CandidateSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getRequestContext();
  const link = await resolveCandidateLink(token, ctx);

  if (!link.open) {
    return (
      <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-6">
        <h1 className="text-xl font-semibold text-slate-900">This link is no longer active.</h1>
        <p className="text-sm text-slate-700">Please contact BuildPro Recruiters at 214-238-5145 and we will send you a new link.</p>
      </section>
    );
  }

  if (link.agreement.status === "signed") {
    return (
      <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-6">
        <h1 className="text-xl font-semibold text-emerald-950">Thank you. Your agreement is signed.</h1>
        <p className="text-sm text-emerald-950">
          Signed {formatCentralDateTime(link.agreement.signed_at ?? new Date())} (Central Time). We will be in touch soon
          about opportunities that fit your goals. Questions? Call Lee Chandler at 214-238-5145.
        </p>
        <a
          href={`/sign/candidate/${token}/copy`}
          className="inline-flex rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
        >
          Download your signed copy (PDF)
        </a>
      </section>
    );
  }

  await recordCandidateView(link.agreement, ctx);
  const c = link.candidate;
  const prefill: Record<string, string> = {
    full_name: c.full_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    city_state: [c.city, c.state].filter(Boolean).join(", "),
    current_title: c.current_title ?? "",
    linkedin_url: c.linkedin_url ?? "",
    recent_submissions: "",
  };
  return <CandidateSigningForm token={token} prefill={prefill} />;
}
