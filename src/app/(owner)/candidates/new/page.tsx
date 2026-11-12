import Link from "next/link";
import { requireOwner } from "@/lib/owner";
import { CANDIDATE_FIELDS } from "@/lib/candidates";
import { FieldForm } from "@/components/field-form";
import { createCandidateAction } from "../actions";

export const metadata = { title: "New candidate" };

export default async function NewCandidatePage() {
  await requireOwner();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/candidates" className="text-sm text-slate-600 hover:text-slate-900">
          Back to candidates
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New candidate</h1>
        <p className="text-sm text-slate-600">
          After saving, you can upload a resume and send the candidate agreement. The agreement fills in these details
          for the candidate.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <FieldForm
          action={createCandidateAction}
          fields={CANDIDATE_FIELDS}
          defaults={{ status: "new" }}
          submitLabel="Save candidate"
          cancelHref="/candidates"
        />
      </div>
    </div>
  );
}
