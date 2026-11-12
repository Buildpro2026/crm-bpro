import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { CONTACT_FIELDS, isUuid } from "@/lib/records";
import { FieldForm } from "@/components/field-form";
import { updateContactAction } from "../../../../actions";

export const metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  const { id, contactId } = await params;
  if (!isUuid(id) || !isUuid(contactId)) notFound();
  const { supabase } = await requireOwner();
  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .eq("company_id", id)
    .maybeSingle();
  if (!contact) notFound();

  const defaults: Record<string, string> = {};
  for (const field of CONTACT_FIELDS) {
    const value = contact[field.name];
    defaults[field.name] = typeof value === "string" ? value : "";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/companies/${id}`} className="text-sm text-slate-600 hover:text-slate-900">
          Back to company
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit contact</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm
          action={updateContactAction}
          fields={CONTACT_FIELDS}
          defaults={defaults}
          hidden={{ company_id: id, contact_id: contactId }}
          submitLabel="Save changes"
          cancelHref={`/companies/${id}`}
        />
      </div>
    </div>
  );
}
