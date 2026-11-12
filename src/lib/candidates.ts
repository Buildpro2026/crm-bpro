// Candidate records: statuses, form fields and validation. Pure module. The
// status list mirrors the check constraint in 0003_candidates_and_files.sql.

import type { RecordFieldSpec } from "@/lib/records";
import { parseMoney } from "@/lib/crm";

export const CANDIDATE_STATUSES = [
  { value: "new", label: "New" },
  { value: "screening", label: "Screening" },
  { value: "active", label: "Active" },
  { value: "submitted", label: "Submitted" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "placed", label: "Placed" },
  { value: "not a fit", label: "Not a fit" },
  { value: "do not contact", label: "Do not contact" },
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]["value"];

export function isCandidateStatus(value: string): value is CandidateStatus {
  return CANDIDATE_STATUSES.some((s) => s.value === value);
}

export function candidateStatusLabel(value: string | null | undefined): string {
  return CANDIDATE_STATUSES.find((s) => s.value === value)?.label ?? "New";
}

export const CANDIDATE_STATUS_BADGE: Record<CandidateStatus, string> = {
  new: "bg-slate-100 text-slate-700 ring-slate-300",
  screening: "bg-sky-50 text-sky-800 ring-sky-300",
  active: "bg-indigo-50 text-indigo-800 ring-indigo-300",
  submitted: "bg-violet-50 text-violet-800 ring-violet-300",
  interviewing: "bg-amber-50 text-amber-900 ring-amber-300",
  offer: "bg-orange-50 text-orange-900 ring-orange-300",
  placed: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  "not a fit": "bg-zinc-100 text-zinc-600 ring-zinc-300",
  "do not contact": "bg-red-50 text-red-800 ring-red-300",
};

export const CANDIDATE_FIELDS: readonly RecordFieldSpec[] = [
  { name: "full_name", label: "Full name", required: true, maxLength: 200 },
  { name: "status", label: "Status", type: "select", options: CANDIDATE_STATUSES, hint: "Defaults to New" },
  { name: "email", label: "Email", type: "email", maxLength: 320 },
  { name: "phone", label: "Mobile phone", type: "tel", maxLength: 40 },
  { name: "city", label: "City", maxLength: 120 },
  { name: "state", label: "State", maxLength: 60 },
  { name: "current_title", label: "Current or most recent title", maxLength: 200 },
  { name: "current_employer", label: "Current or most recent employer", maxLength: 200 },
  { name: "desired_title", label: "Desired title", maxLength: 200 },
  { name: "desired_salary", label: "Desired salary (USD)", maxLength: 20, hint: "For example, 85000" },
  { name: "linkedin_url", label: "LinkedIn profile", type: "url", maxLength: 300 },
  { name: "source", label: "Source", maxLength: 200, hint: "For example, referral, Indeed, LinkedIn" },
  { name: "background", label: "Background and notes", type: "textarea", maxLength: 6000, full: true },
];

export const CANDIDATE_FIELD_NAMES = CANDIDATE_FIELDS.map((f) => f.name);

export type CandidateColumns = {
  full_name: string;
  status: CandidateStatus;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  current_title: string | null;
  current_employer: string | null;
  desired_title: string | null;
  desired_salary: number | null;
  linkedin_url: string | null;
  source: string | null;
  background: string | null;
};

export function validateCandidateInput(
  values: Record<string, string>,
): { ok: true; data: CandidateColumns } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const spec of CANDIDATE_FIELDS) {
    const v = values[spec.name] ?? "";
    if (spec.required && !v) errors[spec.name] = `${spec.label} is required.`;
    else if (spec.maxLength && v.length > spec.maxLength) errors[spec.name] = `Please keep this under ${spec.maxLength} characters.`;
  }
  const status = values.status || "new";
  if (!isCandidateStatus(status)) errors.status = "Choose a status from the list.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Enter a valid email address.";
  const salary = parseMoney(values.desired_salary ?? "");
  if (Number.isNaN(salary)) errors.desired_salary = "Enter an amount such as 85000.";
  if (values.linkedin_url && !/^(https?:\/\/)?([a-z0-9-]+\.)*linkedin\.com\/\S+$/i.test(values.linkedin_url)) {
    errors.linkedin_url = "Enter a LinkedIn profile link, such as linkedin.com/in/name.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const orNull = (k: string) => (values[k] ? values[k] : null);
  return {
    ok: true,
    data: {
      full_name: values.full_name,
      status: status as CandidateStatus,
      email: orNull("email"),
      phone: orNull("phone"),
      city: orNull("city"),
      state: orNull("state"),
      current_title: orNull("current_title"),
      current_employer: orNull("current_employer"),
      desired_title: orNull("desired_title"),
      desired_salary: salary,
      linkedin_url: orNull("linkedin_url"),
      source: orNull("source"),
      background: orNull("background"),
    },
  };
}
