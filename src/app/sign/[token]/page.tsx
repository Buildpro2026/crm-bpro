import { SigningWizard } from "@/components/sign/signing-wizard";
import { getRequestContext } from "@/lib/request-context";
import { recordPageView, resolveSigningLink } from "@/lib/signing/service";
import { AGREEMENT_PARAGRAPHS, AGREEMENT_TITLE } from "@/lib/agreement";
import { INTAKE_SECTIONS } from "@/lib/intake-form";
import { formatCentralDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client agreement" };

const CLOSED_TEXT = "This link is no longer active.";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getRequestContext();
  const link = await resolveSigningLink(token, ctx);

  // Expired, revoked and unknown links get the same polite message, so the
  // page does not reveal which case applies.
  if (!link.open) {
    return <ClosedNotice />;
  }

  await recordPageView(link.request, ctx);
  const row = link.request;

  if (row.status === "fully executed") {
    return (
      <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-6">
        <h1 className="text-xl font-semibold text-emerald-950">Your agreement is fully executed</h1>
        <p className="text-sm text-emerald-950">
          Thank you, {link.contactName || "and welcome"}. BuildPro Recruiters has countersigned the Client
          Representation Agreement for {link.companyName}. You can download your executed copy below.
        </p>
        <a
          href={`/sign/${token}/executed`}
          className="inline-flex rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
        >
          Download executed copy (PDF)
        </a>
      </section>
    );
  }

  if (row.status === "client signed") {
    return (
      <section className="space-y-4 rounded-lg border border-sky-300 bg-sky-50 p-6">
        <h1 className="text-xl font-semibold text-sky-950">Thank you. Your signature was received.</h1>
        <p className="text-sm text-sky-950">
          Your signed copy was recorded on {formatCentralDateTime(row.client_signed_at ?? row.expires_at)} (Central
          Time). BuildPro Recruiters will countersign and send you the executed copy. No further action is needed
          from you.
        </p>
      </section>
    );
  }

  return (
    <SigningWizard
      token={token}
      companyName={link.companyName}
      contactName={link.contactName}
      contactEmail={link.contactEmail ?? ""}
      agreementTitle={AGREEMENT_TITLE}
      agreementParagraphs={[...AGREEMENT_PARAGRAPHS]}
      sections={INTAKE_SECTIONS.map((s) => ({
        title: s.title,
        fields: s.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          options: f.options ? [...f.options] : undefined,
          maxLength: f.maxLength,
        })),
      }))}
      savedAnswers={row.form_answers}
      prefill={link.prefill}
    />
  );
}

function ClosedNotice() {
  return (
    <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-6">
      <h1 className="text-xl font-semibold text-slate-900">{CLOSED_TEXT}</h1>
      <p className="text-sm text-slate-700">
        Please contact BuildPro Recruiters at 214-238-5145 and we will send you a new link.
      </p>
    </section>
  );
}
