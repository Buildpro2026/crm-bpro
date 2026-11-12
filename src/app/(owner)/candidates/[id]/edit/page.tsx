import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/owner";
import { isUuid } from "@/lib/records";
import { CANDIDATE_FIELDS } from "@/lib/candidates";
import { FieldForm } from "@/components/field-form";
import { updateCandidateAction } from "../../actions";

export const metadata = { title: "Edit candidate" };

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const { data: candidate } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!candidate) notFound();

  const defaults: Record<string, string> = {};
  for (const f of CANDIDATE_FIELDS) {
    const v = candidate[f.name];
    defaults[f.name] = v === null || v === undefined ? "" : String(v);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/candidates/${id}`} className="text-sm text-slate-600 hover:text-slate-900">
          Back to {candidate.full_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit candidate</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm
          action={updateCandidateAction}
          fields={CANDIDATE_FIELDS}
          defaults={defaults}
          hidden={{ id }}
          submitLabel="Save changes"
          cancelHref={`/candidates/${id}`}
        />
      </div>
    </div>
  );
}
