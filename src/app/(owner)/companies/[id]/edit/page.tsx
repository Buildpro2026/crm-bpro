import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { COMPANY_FIELDS, isUuid } from "@/lib/records";
import { FieldForm } from "@/components/field-form";
import { updateCompanyAction } from "../../actions";

export const metadata = { title: "Edit company" };

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const { data: company } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) notFound();

  const defaults: Record<string, string> = {};
  for (const field of COMPANY_FIELDS) {
    const value = company[field.name];
    defaults[field.name] = typeof value === "string" ? value : "";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/companies/${id}`} className="text-sm text-slate-600 hover:text-slate-900">
          Back to {company.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit company</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm
          action={updateCompanyAction}
          fields={COMPANY_FIELDS}
          defaults={defaults}
          hidden={{ id }}
          submitLabel="Save changes"
          cancelHref={`/companies/${id}`}
        />
      </div>
    </div>
  );
}
