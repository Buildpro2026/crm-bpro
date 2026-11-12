import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { isUuid, validateCompanyInput, validateContactInput, COMPANY_FIELD_NAMES, CONTACT_FIELD_NAMES } from "@/lib/records";
import { CANDIDATE_FIELD_NAMES, isCandidateStatus, validateCandidateInput } from "@/lib/candidates";
import { DEAL_FIELD_NAMES, isCompanyStatus, isDealStage, validateDealInput, validateNoteBody, validateTaskInput } from "@/lib/crm";
import type { Agent } from "@/lib/agent-api/keys";

export type ApiResult = { status: number; body: unknown };
type Ctx = { db: SupabaseClient; agent: Agent; query: URLSearchParams; body: Record<string, unknown> };

const ok = (body: unknown, status = 200): ApiResult => ({ status, body });
const fail = (status: number, error: string, fields?: Record<string, string>): ApiResult => ({
  status,
  body: fields ? { error, fields } : { error },
});

// Turns any JSON values into the trimmed strings the shared validators expect.
function strings(source: Record<string, unknown>, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = source[n];
    out[n] = v === null || v === undefined ? "" : String(v).trim();
  }
  return out;
}

// For PATCH: start from the stored row, then overlay only the fields sent.
function merged(row: Record<string, unknown>, patch: Record<string, unknown>, names: readonly string[]) {
  const base = strings(row, names);
  for (const n of names) if (n in patch) base[n] = patch[n] === null || patch[n] === undefined ? "" : String(patch[n]).trim();
  return base;
}

const limitOf = (q: URLSearchParams) => Math.min(Math.max(Number(q.get("limit")) || 50, 1), 200);
const term = (q: string) => q.replace(/[%,()*\\]/g, " ").trim().slice(0, 100);

function orNull(v: string) {
  return v ? v : null;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function routeAgentRequest(method: string, segments: string[], ctx: Ctx): Promise<ApiResult> {
  const [resource, id, extra] = segments;
  if (extra !== undefined) return fail(404, "Not found.");
  if (id !== undefined && !isUuid(id)) return fail(404, "Not found.");

  const key = `${method} ${resource ?? ""}${id ? "/:id" : ""}`;
  switch (key) {
    case "GET health":
      return ok({ ok: true, agent: ctx.agent.name });
    case "GET people":
      return findPeople(ctx);
    case "GET candidates":
      return listCandidates(ctx);
    case "POST candidates":
      return createCandidate(ctx);
    case "GET candidates/:id":
      return getCandidate(ctx, id!);
    case "PATCH candidates/:id":
      return updateCandidate(ctx, id!);
    case "GET companies":
      return listCompanies(ctx);
    case "POST companies":
      return createCompany(ctx);
    case "GET companies/:id":
      return getCompany(ctx, id!);
    case "PATCH companies/:id":
      return updateCompany(ctx, id!);
    case "POST contacts":
      return createContact(ctx);
    case "POST notes":
      return createNote(ctx);
    case "POST tasks":
      return createTask(ctx);
    case "GET deals":
      return listDeals(ctx);
    case "GET deals/:id":
      return getDeal(ctx, id!);
    case "PATCH deals/:id":
      return updateDeal(ctx, id!);
    default:
      return fail(404, "Not found.");
  }
}

// ---------------------------------------------------------------------------
// People lookup: the replacement for HubSpot's "find contact by email".
// ---------------------------------------------------------------------------

async function findPeople({ db, query }: Ctx): Promise<ApiResult> {
  const email = (query.get("email") ?? "").trim();
  if (!email) return fail(400, "Pass ?email=");
  const [cands, contacts] = await Promise.all([
    db.from("candidates").select("id, full_name, email, phone, status, current_title").ilike("email", email),
    db.from("contacts").select("id, name, email, phone, title, company_id").ilike("email", email),
  ]);
  return ok({ candidates: cands.data ?? [], contacts: contacts.data ?? [] });
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

async function listCandidates({ db, query }: Ctx): Promise<ApiResult> {
  let q = db
    .from("candidates")
    .select("id, full_name, email, phone, status, current_title, current_employer, city, state, agreement_signed_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limitOf(query));
  const search = term(query.get("q") ?? "");
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,current_title.ilike.%${search}%`);
  const status = query.get("status");
  if (status) {
    if (!isCandidateStatus(status)) return fail(400, "Unknown status.");
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) return fail(500, error.message);
  return ok({ candidates: data });
}

async function createCandidate({ db, agent, body }: Ctx): Promise<ApiResult> {
  const values = strings(body, CANDIDATE_FIELD_NAMES);
  const result = validateCandidateInput(values);
  if (!result.ok) return fail(422, "Invalid candidate.", result.errors);

  // Same email means same person: return the existing record instead of a duplicate.
  if (result.data.email) {
    const { data: existing } = await db.from("candidates").select("*").ilike("email", result.data.email).limit(1);
    if (existing && existing.length > 0) return ok({ candidate: existing[0], created: false });
  }
  const { data, error } = await db.from("candidates").insert(result.data).select("*").single();
  if (error || !data) return fail(500, error?.message ?? "Could not create the candidate.");
  await writeAudit(db, { actor: agent.actor, action: "candidate_created", candidateId: data.id, detail: { via: "agent_api" } });
  return ok({ candidate: data, created: true }, 201);
}

async function getCandidate({ db }: Ctx, id: string): Promise<ApiResult> {
  const [{ data: candidate }, { data: notes }, { data: tasks }, { data: files }] = await Promise.all([
    db.from("candidates").select("*").eq("id", id).maybeSingle(),
    db.from("notes").select("id, body, created_at").eq("candidate_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("tasks").select("id, title, due_date, priority, status").eq("candidate_id", id).order("due_date"),
    db.from("documents").select("id, file_name, folder, kind, created_at").eq("candidate_id", id),
  ]);
  if (!candidate) return fail(404, "Candidate not found.");
  return ok({ candidate, notes, tasks, files });
}

async function updateCandidate({ db, agent, body }: Ctx, id: string): Promise<ApiResult> {
  const { data: row } = await db.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!row) return fail(404, "Candidate not found.");
  const result = validateCandidateInput(merged(row, body, CANDIDATE_FIELD_NAMES));
  if (!result.ok) return fail(422, "Invalid candidate.", result.errors);
  const { data, error } = await db.from("candidates").update(result.data).eq("id", id).select("*").single();
  if (error) return fail(500, error.message);
  await writeAudit(db, {
    actor: agent.actor,
    action: "candidate_updated",
    candidateId: id,
    detail: { via: "agent_api", fields: Object.keys(body) },
  });
  return ok({ candidate: data });
}

// ---------------------------------------------------------------------------
// Companies and contacts
// ---------------------------------------------------------------------------

function companyColumns(v: Record<string, string>) {
  return {
    name: v.name,
    status: v.status || "prospect",
    industry: orNull(v.industry),
    phone: orNull(v.phone),
    website: orNull(v.website),
    hq_city: orNull(v.hq_city),
    hq_state: orNull(v.hq_state),
    source: orNull(v.source),
    notes: orNull(v.notes),
  };
}

async function listCompanies({ db, query }: Ctx): Promise<ApiResult> {
  let q = db
    .from("companies")
    .select("id, name, status, industry, phone, website, hq_city, hq_state, updated_at")
    .order("name")
    .limit(limitOf(query));
  const search = term(query.get("q") ?? "");
  if (search) q = q.or(`name.ilike.%${search}%,website.ilike.%${search}%`);
  const status = query.get("status");
  if (status) {
    if (!isCompanyStatus(status)) return fail(400, "Unknown status.");
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) return fail(500, error.message);
  return ok({ companies: data });
}

async function createCompany({ db, agent, body }: Ctx): Promise<ApiResult> {
  const values = strings(body, COMPANY_FIELD_NAMES);
  const errors = validateCompanyInput(values);
  if (Object.keys(errors).length > 0) return fail(422, "Invalid company.", errors);
  const { data: existing } = await db.from("companies").select("*").ilike("name", values.name).limit(1);
  if (existing && existing.length > 0) return ok({ company: existing[0], created: false });
  const { data, error } = await db.from("companies").insert(companyColumns(values)).select("*").single();
  if (error || !data) return fail(500, error?.message ?? "Could not create the company.");
  await writeAudit(db, { actor: agent.actor, action: "company_created", companyId: data.id, detail: { via: "agent_api" } });
  return ok({ company: data, created: true }, 201);
}

async function getCompany({ db }: Ctx, id: string): Promise<ApiResult> {
  const [{ data: company }, { data: contacts }, { data: deals }, { data: notes }] = await Promise.all([
    db.from("companies").select("*").eq("id", id).maybeSingle(),
    db.from("contacts").select("*").eq("company_id", id).order("name"),
    db.from("deals").select("*").eq("company_id", id),
    db.from("notes").select("id, body, created_at, deal_id, contact_id").eq("company_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (!company) return fail(404, "Company not found.");
  return ok({ company, contacts, deals, notes });
}

async function updateCompany({ db, agent, body }: Ctx, id: string): Promise<ApiResult> {
  const { data: row } = await db.from("companies").select("*").eq("id", id).maybeSingle();
  if (!row) return fail(404, "Company not found.");
  const values = merged(row, body, COMPANY_FIELD_NAMES);
  const errors = validateCompanyInput(values);
  if (Object.keys(errors).length > 0) return fail(422, "Invalid company.", errors);
  const { data, error } = await db.from("companies").update(companyColumns(values)).eq("id", id).select("*").single();
  if (error) return fail(500, error.message);
  await writeAudit(db, { actor: agent.actor, action: "company_updated", companyId: id, detail: { via: "agent_api", fields: Object.keys(body) } });
  return ok({ company: data });
}

async function createContact({ db, agent, body }: Ctx): Promise<ApiResult> {
  let companyId = typeof body.company_id === "string" ? body.company_id : "";
  if (!companyId && typeof body.company_name === "string" && body.company_name.trim()) {
    const made = await createCompany({ db, agent, body: { name: body.company_name }, query: new URLSearchParams() });
    if (made.status >= 400) return made;
    companyId = (made.body as { company: { id: string } }).company.id;
  }
  if (!isUuid(companyId)) return fail(422, "Pass company_id or company_name.");
  const values = strings(body, CONTACT_FIELD_NAMES);
  const errors = validateContactInput(values);
  if (Object.keys(errors).length > 0) return fail(422, "Invalid contact.", errors);
  if (values.email) {
    const { data: existing } = await db.from("contacts").select("*").eq("company_id", companyId).ilike("email", values.email).limit(1);
    if (existing && existing.length > 0) return ok({ contact: existing[0], created: false });
  }
  const { data, error } = await db
    .from("contacts")
    .insert({
      company_id: companyId,
      name: values.name,
      title: orNull(values.title),
      email: orNull(values.email),
      phone: orNull(values.phone),
      role_note: orNull(values.role_note),
    })
    .select("*")
    .single();
  if (error || !data) return fail(error?.message.includes("foreign key") ? 422 : 500, error?.message ?? "Could not create the contact.");
  await writeAudit(db, { actor: agent.actor, action: "contact_created", companyId, detail: { via: "agent_api", contact_id: data.id } });
  return ok({ contact: data, created: true }, 201);
}

// ---------------------------------------------------------------------------
// Notes and tasks
// ---------------------------------------------------------------------------

function links(body: Record<string, unknown>) {
  const pick = (k: string) => (typeof body[k] === "string" && isUuid(body[k] as string) ? (body[k] as string) : null);
  return { company_id: pick("company_id"), contact_id: pick("contact_id"), deal_id: pick("deal_id"), candidate_id: pick("candidate_id") };
}

async function createNote({ db, agent, body }: Ctx): Promise<ApiResult> {
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const problem = validateNoteBody(text);
  if (problem) return fail(422, problem);
  const l = links(body);
  if (!l.company_id && !l.contact_id && !l.deal_id && !l.candidate_id) {
    return fail(422, "Link the note to a candidate_id, company_id, contact_id or deal_id.");
  }
  const { data, error } = await db.from("notes").insert({ ...l, body: text }).select("*").single();
  if (error || !data) return fail(422, error?.message ?? "Could not save the note.");
  await writeAudit(db, {
    actor: agent.actor,
    action: "note_added",
    companyId: data.company_id,
    candidateId: data.candidate_id,
    detail: { via: "agent_api", note_id: data.id },
  });
  return ok({ note: data }, 201);
}

async function createTask({ db, agent, body }: Ctx): Promise<ApiResult> {
  const result = validateTaskInput(strings(body, ["title", "details", "due_date", "priority"]));
  if (!result.ok) return fail(422, "Invalid task.", result.errors);
  const { data, error } = await db.from("tasks").insert({ ...result.data, ...links(body) }).select("*").single();
  if (error || !data) return fail(422, error?.message ?? "Could not save the task.");
  await writeAudit(db, {
    actor: agent.actor,
    action: "task_created",
    companyId: data.company_id,
    candidateId: data.candidate_id,
    detail: { via: "agent_api", task_id: data.id, title: data.title },
  });
  return ok({ task: data }, 201);
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

async function listDeals({ db, query }: Ctx): Promise<ApiResult> {
  let q = db.from("deals").select("*").order("updated_at", { ascending: false }).limit(limitOf(query));
  const stage = query.get("stage");
  if (stage) {
    if (!isDealStage(stage)) return fail(400, "Unknown stage.");
    q = q.eq("stage", stage);
  }
  const companyId = query.get("company_id");
  if (companyId) {
    if (!isUuid(companyId)) return fail(400, "Bad company_id.");
    q = q.eq("company_id", companyId);
  }
  const { data, error } = await q;
  if (error) return fail(500, error.message);
  return ok({ deals: data });
}

async function getDeal({ db }: Ctx, id: string): Promise<ApiResult> {
  const { data } = await db.from("deals").select("*").eq("id", id).maybeSingle();
  return data ? ok({ deal: data }) : fail(404, "Deal not found.");
}

async function updateDeal({ db, agent, body }: Ctx, id: string): Promise<ApiResult> {
  const { data: row } = await db.from("deals").select("*").eq("id", id).maybeSingle();
  if (!row) return fail(404, "Deal not found.");
  const result = validateDealInput(merged(row, body, DEAL_FIELD_NAMES));
  if (!result.ok) return fail(422, "Invalid deal.", result.errors);
  const { data, error } = await db.from("deals").update(result.data).eq("id", id).select("*").single();
  if (error) return fail(422, error.message);
  await writeAudit(db, { actor: agent.actor, action: "deal_updated", companyId: data.company_id, detail: { deal_id: id, via: "agent_api" } });
  if (row.stage !== data.stage) {
    await writeAudit(db, {
      actor: agent.actor,
      action: "deal_stage_changed",
      companyId: data.company_id,
      detail: { deal_id: id, from: row.stage, to: data.stage, via: "agent_api" },
    });
  }
  return ok({ deal: data });
}
