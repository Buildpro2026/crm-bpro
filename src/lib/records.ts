// Company and contact records: field names, labels and validation. Pure
// module, shared by the forms and the server actions.

import { COMPANY_STATUSES, isCompanyStatus } from "@/lib/crm";

export type RecordFieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "textarea" | "select";
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  full?: boolean;
  maxLength?: number;
  hint?: string;
};

export const COMPANY_FIELDS: readonly RecordFieldSpec[] = [
  { name: "name", label: "Company name", required: true, maxLength: 200, full: true },
  { name: "status", label: "Status", type: "select", options: COMPANY_STATUSES, hint: "Defaults to Prospect" },
  { name: "industry", label: "Industry", maxLength: 200 },
  { name: "phone", label: "Main phone", type: "tel", maxLength: 40 },
  { name: "website", label: "Website", type: "url", maxLength: 300, hint: "For example, example.com" },
  { name: "hq_city", label: "Headquarters city", maxLength: 120 },
  { name: "hq_state", label: "Headquarters state", maxLength: 60 },
  { name: "source", label: "Lead source", maxLength: 200, hint: "For example, referral, LinkedIn, cold call" },
  { name: "notes", label: "Background", type: "textarea", maxLength: 4000, full: true },
];

export const CONTACT_FIELDS: readonly RecordFieldSpec[] = [
  { name: "name", label: "Full name", required: true, maxLength: 200 },
  { name: "title", label: "Title", maxLength: 200 },
  { name: "email", label: "Email", type: "email", maxLength: 320 },
  { name: "phone", label: "Phone", type: "tel", maxLength: 40 },
  { name: "role_note", label: "Role in the search", type: "textarea", maxLength: 1000, full: true },
];

export const COMPANY_FIELD_NAMES = COMPANY_FIELDS.map((f) => f.name);
export const CONTACT_FIELD_NAMES = CONTACT_FIELDS.map((f) => f.name);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function checkLengths(values: Record<string, string>, specs: readonly RecordFieldSpec[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const value = values[spec.name] ?? "";
    if (spec.required && !value) errors[spec.name] = `${spec.label} is required.`;
    else if (spec.maxLength && value.length > spec.maxLength) {
      errors[spec.name] = `Please keep this under ${spec.maxLength} characters.`;
    }
  }
  return errors;
}

export function validateCompanyInput(values: Record<string, string>): Record<string, string> {
  const errors = checkLengths(values, COMPANY_FIELDS);
  if (values.website && !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(values.website)) {
    errors.website = "Enter a web address such as example.com.";
  }
  if (values.status && !isCompanyStatus(values.status)) {
    errors.status = "Choose a status from the list.";
  }
  return errors;
}

export function validateContactInput(values: Record<string, string>): Record<string, string> {
  const errors = checkLengths(values, CONTACT_FIELDS);
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}
