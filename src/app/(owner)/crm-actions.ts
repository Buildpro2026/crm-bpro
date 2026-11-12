"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner, type OwnerContext } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";
import { readStrings, type FormState } from "@/lib/form-state";
import { isUuid } from "@/lib/records";
import { safeNextPath } from "@/lib/safe-redirect";
import {
  DEAL_FIELD_NAMES,
  isDealStage,
  stageLabel,
  validateDealInput,
  validateNoteBody,
  validateTaskInput,
} from "@/lib/crm";

// Turns a database error into a sentence for the form. Link-consistency
// errors come from the enforce_company_links trigger.
function friendly(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/different company/.test(message)) return "That contact or deal belongs to a different company.";
  if (/not found/.test(message)) return "A linked record was not found. Refresh and try again.";
  return `${fallback} ${message}`;
}

function refresh(...paths: Array<string | null | undefined>) {
  for (const p of new Set(["/dashboard", ...paths.filter((x): x is string => Boolean(x))])) revalidatePath(p);
}

function optionalUuid(value: FormDataEntryValue | null): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return isUuid(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export async function createDealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const values = readStrings(formData, DEAL_FIELD_NAMES);
  const result = validateDealInput(values);
  if (!result.ok) return { error: "Please fix the highlighted fields.", fieldErrors: result.errors, values };

  const { data, error } = await owner.supabase
    .from("deals")
    .insert({ ...result.data, created_by: owner.profile.id })
    .select("id, company_id")
    .single();
  if (error || !data) return { error: friendly(error?.message, "The deal could not be saved."), values };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "deal_created",
    companyId: data.company_id,
    detail: { deal_id: data.id, name: result.data.name, stage: result.data.stage },
  });
  refresh("/deals", `/companies/${data.company_id}`);
  redirect(`/deals/${data.id}`);
}

export async function updateDealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { error: "That deal was not found." };
  const values = readStrings(formData, DEAL_FIELD_NAMES);
  const result = validateDealInput(values);
  if (!result.ok) return { error: "Please fix the highlighted fields.", fieldErrors: result.errors, values };

  const { data: before } = await owner.supabase.from("deals").select("stage").eq("id", id).maybeSingle();
  if (!before) return { error: "That deal was not found.", values };

  const { data, error } = await owner.supabase
    .from("deals")
    .update(result.data)
    .eq("id", id)
    .select("id, company_id")
    .maybeSingle();
  if (error || !data) return { error: friendly(error?.message, "The deal could not be saved."), values };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "deal_updated",
    companyId: data.company_id,
    detail: { deal_id: id },
  });
  if (before.stage !== result.data.stage) {
    await auditStageChange(owner, data.company_id, id, before.stage, result.data.stage);
  }
  refresh("/deals", `/deals/${id}`, `/companies/${data.company_id}`);
  redirect(`/deals/${id}`);
}

async function auditStageChange(owner: OwnerContext, companyId: string, dealId: string, from: string, to: string) {
  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "deal_stage_changed",
    companyId,
    detail: { deal_id: dealId, from, to, summary: `${stageLabel(from)} to ${stageLabel(to)}` },
  });
}

// Used by the pipeline board (drag and drop) and the stage picker on a deal.
export async function moveDealStageAction(dealId: string, stage: string): Promise<{ ok: boolean; error?: string }> {
  const owner = await requireOwner();
  if (!isUuid(dealId) || !isDealStage(stage)) return { ok: false, error: "That move is not allowed." };

  const { data: before } = await owner.supabase
    .from("deals")
    .select("stage, company_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!before) return { ok: false, error: "That deal was not found." };
  if (before.stage === stage) return { ok: true };

  const { error } = await owner.supabase.from("deals").update({ stage }).eq("id", dealId);
  if (error) return { ok: false, error: "The stage could not be changed. Refresh and try again." };

  await auditStageChange(owner, before.company_id, dealId, before.stage, stage);
  refresh("/deals", `/deals/${dealId}`, `/companies/${before.company_id}`);
  return { ok: true };
}

// Plain form version of the stage picker, for use without client JavaScript.
export async function setDealStageFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  await moveDealStageAction(id, stage);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const body = String(formData.get("body") ?? "").trim();
  const companyId = optionalUuid(formData.get("company_id"));
  const contactId = optionalUuid(formData.get("contact_id"));
  const dealId = optionalUuid(formData.get("deal_id"));
  const candidateId = optionalUuid(formData.get("candidate_id"));
  const returnPath = safeNextPath(String(formData.get("return_path") ?? ""));

  const problem = validateNoteBody(body);
  if (problem) return { error: problem, values: { body } };
  if (!companyId && !dealId && !contactId && !candidateId) {
    return { error: "This note is not linked to a record.", values: { body } };
  }

  const { data, error } = await owner.supabase
    .from("notes")
    .insert({
      company_id: companyId,
      contact_id: contactId,
      deal_id: dealId,
      ...(candidateId ? { candidate_id: candidateId } : {}),
      body,
      created_by: owner.profile.id,
    })
    .select("id, company_id")
    .single();
  if (error || !data) return { error: friendly(error?.message, "The note could not be saved."), values: { body } };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "note_added",
    companyId: data.company_id,
    candidateId,
    detail: { note_id: data.id, deal_id: dealId, contact_id: contactId },
  });
  refresh(returnPath, data.company_id ? `/companies/${data.company_id}` : null, dealId ? `/deals/${dealId}` : null);
  return { ok: true, savedAt: Date.now() };
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const returnPath = safeNextPath(String(formData.get("return_path") ?? ""));
  if (!isUuid(id)) return;

  const { data } = await owner.supabase.from("notes").delete().eq("id", id).select("*").maybeSingle();
  if (!data) return;
  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "note_deleted",
    companyId: data.company_id,
    candidateId: data.candidate_id ?? null,
    detail: { note_id: id, deal_id: data.deal_id },
  });
  refresh(returnPath, data.company_id ? `/companies/${data.company_id}` : null, data.deal_id ? `/deals/${data.deal_id}` : null);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TASK_FIELDS = ["title", "details", "due_date", "priority"] as const;

export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const values = readStrings(formData, TASK_FIELDS);
  const result = validateTaskInput(values);
  if (!result.ok) return { error: "Please fix the highlighted fields.", fieldErrors: result.errors, values };

  const companyId = optionalUuid(formData.get("company_id"));
  const contactId = optionalUuid(formData.get("contact_id"));
  const dealId = optionalUuid(formData.get("deal_id"));
  const candidateId = optionalUuid(formData.get("candidate_id"));
  const returnPath = safeNextPath(String(formData.get("return_path") ?? "/tasks"));

  const { data, error } = await owner.supabase
    .from("tasks")
    .insert({
      ...result.data,
      company_id: companyId,
      contact_id: contactId,
      deal_id: dealId,
      ...(candidateId ? { candidate_id: candidateId } : {}),
      created_by: owner.profile.id,
    })
    .select("id, company_id")
    .single();
  if (error || !data) return { error: friendly(error?.message, "The task could not be saved."), values };

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "task_created",
    companyId: data.company_id,
    candidateId,
    detail: { task_id: data.id, title: result.data.title, deal_id: dealId, contact_id: contactId },
  });
  refresh(returnPath, "/tasks", data.company_id ? `/companies/${data.company_id}` : null, dealId ? `/deals/${dealId}` : null);
  return { ok: true, savedAt: Date.now() };
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const returnPath = safeNextPath(String(formData.get("return_path") ?? "/tasks"));
  if (!isUuid(id)) return;

  const { data: task } = await owner.supabase
    .from("tasks")
    .select("status, company_id, deal_id")
    .eq("id", id)
    .maybeSingle();
  if (!task) return;
  const next = task.status === "done" ? "open" : "done";
  const { error } = await owner.supabase.from("tasks").update({ status: next }).eq("id", id);
  if (error) return;

  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: next === "done" ? "task_completed" : "task_reopened",
    companyId: task.company_id,
    detail: { task_id: id },
  });
  refresh(returnPath, "/tasks", task.company_id ? `/companies/${task.company_id}` : null, task.deal_id ? `/deals/${task.deal_id}` : null);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const returnPath = safeNextPath(String(formData.get("return_path") ?? "/tasks"));
  if (!isUuid(id)) return;

  const { data } = await owner.supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id, title, company_id, deal_id")
    .maybeSingle();
  if (!data) return;
  await writeAudit(owner.supabase, {
    actor: owner.actor,
    action: "task_deleted",
    companyId: data.company_id,
    detail: { task_id: id, title: data.title },
  });
  refresh(returnPath, "/tasks", data.company_id ? `/companies/${data.company_id}` : null, data.deal_id ? `/deals/${data.deal_id}` : null);
}
