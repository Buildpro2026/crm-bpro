import { requireOwner } from "@/lib/owner";
import { formatCentralDateTime } from "@/lib/time";
import { NewApiKey } from "@/components/crm/new-api-key";
import { revokeApiKeyAction } from "./actions";

export const metadata = { title: "Agent API keys" };
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const { supabase } = await requireOwner();
  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Agent API keys</h1>
        <p className="text-sm text-slate-600">
          Keys let BuildPro&apos;s agents, such as Chad, read and update candidates, companies, notes, tasks and deals in
          this CRM instead of HubSpot. Every change an agent makes shows in the activity history with the key&apos;s name.
          Give each agent its own key so you can turn one off without affecting the others.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <NewApiKey />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Keys could not be loaded: {error.message}. If this mentions a missing table, apply migration 0004.
        </p>
      ) : null}

      {keys && keys.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">
                  {k.name} <span className="font-mono text-xs text-slate-500">{k.key_prefix}...</span>
                </p>
                <p className="text-xs text-slate-500">
                  Created {formatCentralDateTime(k.created_at)}
                  {k.last_used_at ? `, last used ${formatCentralDateTime(k.last_used_at)}` : ", never used"}
                </p>
              </div>
              {k.revoked_at ? (
                <span className="text-xs font-semibold text-red-700">Revoked {formatCentralDateTime(k.revoked_at)}</span>
              ) : (
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
