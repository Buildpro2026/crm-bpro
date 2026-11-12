import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { isUuid } from "@/lib/records";
import { FieldForm } from "@/components/field-form";
import { updateDealAction } from "../../../crm-actions";
import { dealFormFields } from "../../deal-fields";

export const metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) notFound();
  const fields = await dealFormFields(supabase);

  const defaults: Record<string, string> = {};
  for (const f of fields) {
    const v = deal[f.name];
    defaults[f.name] = v === null || v === undefined ? "" : String(v);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/deals/${id}`} className="text-sm text-slate-600 hover:text-slate-900">
          Back to {deal.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit deal</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm
          action={updateDealAction}
          fields={fields}
          defaults={defaults}
          hidden={{ id }}
          submitLabel="Save changes"
          cancelHref={`/deals/${id}`}
        />
      </div>
    </div>
  );
}
