import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/owner";
import { safeNextPath } from "@/lib/safe-redirect";
import { FieldForm, type FieldSpec } from "@/components/field-form";
import { loginAction } from "./actions";

export const metadata = { title: "Sign in" };

const fields: FieldSpec[] = [
  { name: "email", label: "Email", type: "email", required: true, autoComplete: "email", full: true },
  { name: "password", label: "Password", type: "password", required: true, autoComplete: "current-password", full: true },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getOwnerContext()) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-800">BuildPro Recruiters, LLC</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in to BuildPro CRM</h1>
        <p className="mt-2 text-sm text-slate-600">Owner access only.</p>
        {params.error === "not-authorized" ? (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            This account is not authorized for BuildPro CRM.
          </p>
        ) : null}
        <div className="mt-6">
          <FieldForm
            action={loginAction}
            fields={fields}
            hidden={{ next }}
            submitLabel="Sign in"
          />
        </div>
      </div>
    </main>
  );
}
