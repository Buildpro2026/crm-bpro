import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSpec } from "@/components/field-form";
import { DEAL_STAGES } from "@/lib/crm";

// Builds the deal form fields with the owner's companies and contacts as
// choices. The server re-checks that the contact belongs to the company.
export async function dealFormFields(supabase: SupabaseClient): Promise<FieldSpec[]> {
  const [companiesRes, contactsRes] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
  ]);
  const companies = companiesRes.data ?? [];
  const companyName = new Map(companies.map((c) => [c.id as string, c.name as string]));
  const contacts = (contactsRes.data ?? []).map((c) => ({
    value: c.id as string,
    label: `${c.name} (${companyName.get(c.company_id) ?? "Unknown company"})`,
  }));

  return [
    { name: "name", label: "Deal name", required: true, maxLength: 200, full: true, hint: "For example, Acme: Project Manager search" },
    {
      name: "company_id",
      label: "Company",
      type: "select",
      required: true,
      options: companies.map((c) => ({ value: c.id as string, label: c.name as string })),
    },
    { name: "contact_id", label: "Main contact", type: "select", options: contacts, hint: "Must work at the company above" },
    { name: "stage", label: "Stage", type: "select", options: DEAL_STAGES.map((s) => ({ value: s.value, label: s.label })) },
    { name: "position_title", label: "Position to fill", maxLength: 200 },
    { name: "positions_count", label: "Number of openings", type: "number" },
    { name: "estimated_value", label: "Estimated fee (USD)", hint: "Expected placement fee, for example 25000" },
    { name: "fee_percent", label: "Fee percentage", type: "number", hint: "For example, 20" },
    { name: "expected_close_date", label: "Expected close date", type: "date" },
    { name: "lost_reason", label: "Lost reason", type: "textarea", maxLength: 1000, hint: "Only if the deal was lost" },
  ];
}
