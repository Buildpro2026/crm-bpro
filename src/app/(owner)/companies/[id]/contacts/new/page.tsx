import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { CONTACT_FIELDS, isUuid } from "@/lib/records";
import { FieldForm } from "@/components/field-form";
import { createContactAction } from "../../../actions";

export const metadata = { title: "Add contact" };

export default async function NewContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const { data: company } = await supabase.from("companies").select("id, name").eq("id", id).maybeSingle();
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/companies/${id}`} className="text-sm text-slate-600 hover:text-slate-900">
          Back to {company.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Add contact</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm
          action={createContactAction}
          fields={CONTACT_FIELDS}
          hidden={{ company_id: id }}
          submitLabel="Save contact"
          cancelHref={`/companies/${id}`}
        />
      </div>
    </div>
  );
}
