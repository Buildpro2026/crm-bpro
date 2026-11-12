import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { isUuid } from "@/lib/records";
import { FieldForm } from "@/components/field-form";
import { createDealAction } from "../../crm-actions";
import { dealFormFields } from "../deal-fields";

export const metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  const { supabase } = await requireOwner();
  const fields = await dealFormFields(supabase);
  const companyField = fields.find((f) => f.name === "company_id");
  const hasCompanies = (companyField?.options?.length ?? 0) > 0;
  const backHref = company && isUuid(company) ? `/companies/${company}` : "/deals";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-slate-600 hover:text-slate-900">
          Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New deal</h1>
      </div>
      {hasCompanies ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <FieldForm
            action={createDealAction}
            fields={fields}
            defaults={{ company_id: company && isUuid(company) ? company : "", stage: "new lead", positions_count: "1" }}
            submitLabel="Save deal"
            cancelHref={backHref}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          A deal belongs to a company. <Link href="/companies/new" className="text-sky-900 underline">Add a company</Link> first.
        </div>
      )}
    </div>
  );
}
