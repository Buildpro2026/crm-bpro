import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { COMPANY_FIELDS } from "@/lib/records";
import { FieldForm } from "@/components/field-form";
import { createCompanyAction } from "../actions";

export const metadata = { title: "New company" };

export default async function NewCompanyPage() {
  await requireOwner();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-slate-600 hover:text-slate-900">
          Back to companies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New company</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm action={createCompanyAction} fields={COMPANY_FIELDS} submitLabel="Save company" cancelHref="/companies" />
      </div>
    </div>
  );
}
