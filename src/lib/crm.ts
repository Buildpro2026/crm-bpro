// Milestone 2 CRM core: deal stages, company statuses, task rules, and input
// validation. Pure module, shared by forms, server actions and tests. The
// lists here mirror the check constraints in 0002_milestone2_crm_core.sql.

import { CENTRAL_TIME_ZONE } from "@/lib/time";

export const DEAL_STAGES = [
  { value: "new lead", label: "New lead", tone: "slate" },
  { value: "contacted", label: "Contacted", tone: "sky" },
  { value: "discovery meeting", label: "Discovery meeting", tone: "indigo" },
  { value: "proposal sent", label: "Proposal sent", tone: "violet" },
  { value: "agreement sent", label: "Agreement sent", tone: "amber" },
  { value: "won", label: "Won", tone: "emerald" },
  { value: "lost", label: "Lost", tone: "zinc" },
] as const;

export type DealStage = (typeof DEAL_STAGES)[number]["value"];
export const OPEN_DEAL_STAGES: readonly DealStage[] = DEAL_STAGES.map((s) => s.value).filter(
  (v) => v !== "won" && v !== "lost",
);

export function isDealStage(value: string): value is DealStage {
  return DEAL_STAGES.some((s) => s.value === value);
}

export function stageLabel(value: string): string {
  return DEAL_STAGES.find((s) => s.value === value)?.label ?? value;
}

export const STAGE_BADGE: Record<DealStage, string> = {
  "new lead": "bg-slate-100 text-slate-700 ring-slate-300",
  contacted: "bg-sky-50 text-sky-800 ring-sky-300",
  "discovery meeting": "bg-indigo-50 text-indigo-800 ring-indigo-300",
  "proposal sent": "bg-violet-50 text-violet-800 ring-violet-300",
  "agreement sent": "bg-amber-50 text-amber-900 ring-amber-300",
  won: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  lost: "bg-zinc-100 text-zinc-600 ring-zinc-300",
};

export const COMPANY_STATUSES = [
  { value: "prospect", label: "Prospect" },
  { value: "active client", label: "Active client" },
  { value: "past client", label: "Past client" },
  { value: "inactive", label: "Inactive" },
] as const;

export type CompanyStatus = (typeof COMPANY_STATUSES)[number]["value"];

export function isCompanyStatus(value: string): value is CompanyStatus {
  return COMPANY_STATUSES.some((s) => s.value === value);
}

export function companyStatusLabel(value: string | null | undefined): string {
  return COMPANY_STATUSES.find((s) => s.value === value)?.label ?? "Prospect";
}

export const COMPANY_STATUS_BADGE: Record<CompanyStatus, string> = {
  prospect: "bg-sky-50 text-sky-800 ring-sky-300",
  "active client": "bg-emerald-50 text-emerald-800 ring-emerald-300",
  "past client": "bg-amber-50 text-amber-900 ring-amber-300",
  inactive: "bg-zinc-100 text-zinc-600 ring-zinc-300",
};

export const TASK_PRIORITIES = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number]["value"];

export function isTaskPriority(value: string): value is TaskPriority {
  return TASK_PRIORITIES.some((p) => p.value === value);
}

// ---------------------------------------------------------------------------
// Dates. Due dates are calendar dates (YYYY-MM-DD) in Central Time.
// ---------------------------------------------------------------------------

const isoDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CENTRAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function centralToday(now: Date = new Date()): string {
  return isoDayFormat.format(now);
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

// Formats a plain calendar date without shifting it through a time zone.
export function formatIsoDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return shortDateFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

export type TaskBucket = "overdue" | "today" | "this week" | "later" | "no date" | "done";

export function taskBucket(
  task: { status: string; due_date: string | null },
  today: string = centralToday(),
): TaskBucket {
  if (task.status === "done") return "done";
  if (!task.due_date) return "no date";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date <= addDaysToIsoDate(today, 7)) return "this week";
  return "later";
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? usd.format(n) : "";
}

// Accepts "45000", "45,000", "$45,000.50". Returns null for blank, NaN for junk.
export function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export function sumValues(rows: ReadonlyArray<{ estimated_value: number | string | null }>): number {
  return rows.reduce((total, r) => total + (r.estimated_value === null ? 0 : Number(r.estimated_value) || 0), 0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const DEAL_FIELD_NAMES = [
  "name",
  "company_id",
  "contact_id",
  "stage",
  "position_title",
  "positions_count",
  "estimated_value",
  "fee_percent",
  "expected_close_date",
  "lost_reason",
] as const;

export type DealInput = {
  name: string;
  company_id: string;
  contact_id: string | null;
  stage: DealStage;
  position_title: string | null;
  positions_count: number;
  estimated_value: number | null;
  fee_percent: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateDealInput(
  values: Record<string, string>,
): { ok: true; data: DealInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = values.name ?? "";
  if (!name) errors.name = "Deal name is required.";
  else if (name.length > 200) errors.name = "Please keep this under 200 characters.";

  const companyId = values.company_id ?? "";
  if (!UUID.test(companyId)) errors.company_id = "Choose a company.";

  const contactId = values.contact_id ?? "";
  if (contactId && !UUID.test(contactId)) errors.contact_id = "Choose a contact from the list.";

  const stage = values.stage || "new lead";
  if (!isDealStage(stage)) errors.stage = "Choose a stage from the list.";

  const positionTitle = values.position_title ?? "";
  if (positionTitle.length > 200) errors.position_title = "Please keep this under 200 characters.";

  let positions = 1;
  if (values.positions_count) {
    positions = Number(values.positions_count);
    if (!Number.isInteger(positions) || positions < 1 || positions > 500) {
      errors.positions_count = "Enter a whole number from 1 to 500.";
    }
  }

  const value = parseMoney(values.estimated_value ?? "");
  if (Number.isNaN(value)) errors.estimated_value = "Enter an amount such as 45000.";
  else if (value !== null && value > 9_999_999_999) errors.estimated_value = "That amount is too large.";

  let fee: number | null = null;
  if (values.fee_percent) {
    fee = Number(values.fee_percent.replace("%", "").trim());
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) errors.fee_percent = "Enter a percentage from 0 to 100.";
  }

  const close = values.expected_close_date ?? "";
  if (close && !isIsoDate(close)) errors.expected_close_date = "Enter a valid date.";

  const lostReason = values.lost_reason ?? "";
  if (lostReason.length > 1000) errors.lost_reason = "Please keep this under 1000 characters.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      company_id: companyId,
      contact_id: contactId || null,
      stage: stage as DealStage,
      position_title: positionTitle || null,
      positions_count: positions,
      estimated_value: value,
      fee_percent: fee,
      expected_close_date: close || null,
      lost_reason: lostReason || null,
    },
  };
}

export type TaskInput = {
  title: string;
  details: string | null;
  due_date: string | null;
  priority: TaskPriority;
};

export function validateTaskInput(
  values: Record<string, string>,
): { ok: true; data: TaskInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = values.title ?? "";
  if (!title) errors.title = "Describe the task.";
  else if (title.length > 300) errors.title = "Please keep this under 300 characters.";
  const details = values.details ?? "";
  if (details.length > 4000) errors.details = "Please keep this under 4000 characters.";
  const due = values.due_date ?? "";
  if (due && !isIsoDate(due)) errors.due_date = "Enter a valid date.";
  const priority = values.priority || "normal";
  if (!isTaskPriority(priority)) errors.priority = "Choose a priority.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { title, details: details || null, due_date: due || null, priority: priority as TaskPriority },
  };
}

export function validateNoteBody(body: string): string | null {
  if (!body.trim()) return "Write something before saving the note.";
  if (body.length > 10000) return "Please keep notes under 10,000 characters.";
  return null;
}
