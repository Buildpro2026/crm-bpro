import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

// Runs the real migration file in an in-process Postgres (PGlite), with
// minimal stand-ins for the Supabase-managed auth and storage schemas and the
// anon / authenticated / service_role roles. The point is to prove the SQL
// applies cleanly and that row level security, the owner gate, the audit
// trigger, and the private bucket behave as specified.

const MIGRATION = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/0001_milestone1_foundation.sql", import.meta.url)),
  "utf8",
);
const MIGRATION_2 = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/0002_milestone2_crm_core.sql", import.meta.url)),
  "utf8",
);

const MIGRATION_3 = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/0003_candidates_and_files.sql", import.meta.url)),
  "utf8",
);

const MIGRATION_4 = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/0004_agent_api_keys.sql", import.meta.url)),
  "utf8",
);

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";
const HASH = "a".repeat(64);

const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    created_at timestamptz default now()
  );
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false
  );

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
`;

let db: PGlite;

async function asRole(role: "anon" | "authenticated", uid?: string) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  await db.exec(`set role ${role}`);
}

async function asPostgres() {
  await db.exec("reset role");
}

// Returns the error message if the statement fails, or null on success.
async function attempt(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_STUBS);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION_2);
  await db.exec(MIGRATION_3);
  await db.exec(MIGRATION_4);
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated`);
  await db.exec(`grant execute on all functions in schema public to authenticated`);
  await db.exec(`grant all on all tables in schema public to service_role`);
  await db.exec(`grant execute on all functions in schema public to service_role`);
  await db.exec(`grant usage on all sequences in schema public to authenticated, service_role`);
  // Accounts. Creating the owner Auth user fires the owner-profile trigger.
  await db.query(`insert into auth.users (id, email) values ($1, 'lchandler@buildprorecruiters.com')`, [OWNER_ID]);
  await db.query(`insert into auth.users (id, email) values ($1, 'someone.else@example.com')`, [STRANGER_ID]);
});

afterAll(async () => {
  await db?.close();
});

describe("migration applies", () => {
  it("creates every Milestone 1 table", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = rows.map((r) => r.table_name);
    for (const expected of [
      "audit_log",
      "companies",
      "contacts",
      "documents",
      "profiles",
      "signature_requests",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("enables row level security on every public table", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });

  it("creates the owner profile for Lee Chandler and no profile for anyone else", async () => {
    const { rows } = await db.query<{ id: string; full_name: string }>(`select id, full_name from profiles`);
    expect(rows).toEqual([{ id: OWNER_ID, full_name: "Lee Chandler" }]);
  });

  it("creates the documents bucket as private", async () => {
    const { rows } = await db.query<{ id: string; public: boolean }>(
      `select id, public from storage.buckets where id = 'documents'`,
    );
    expect(rows).toEqual([{ id: "documents", public: false }]);
  });
});

describe("row level security", () => {
  it("anonymous visitors cannot read company data", async () => {
    await asPostgres();
    await db.query(
      `insert into companies (id, name) values ('33333333-3333-4333-8333-333333333333', 'Dummy Test Co')`,
    );
    await asRole("anon");
    const error = await attempt(`select * from companies`);
    await asPostgres();
    // Either the privilege is revoked outright, or RLS returns zero rows.
    if (error === null) {
      await asRole("anon");
      const { rows } = await db.query(`select * from companies`);
      await asPostgres();
      expect(rows).toHaveLength(0);
    } else {
      expect(error).toMatch(/permission denied/i);
    }
  });

  it("anonymous visitors cannot write anywhere", async () => {
    await asRole("anon");
    const error = await attempt(`insert into companies (name) values ('Intruder Co')`);
    await asPostgres();
    expect(error).not.toBeNull();
  });

  it("a signed-in user without an owner profile sees and writes nothing", async () => {
    await asRole("authenticated", STRANGER_ID);
    const { rows } = await db.query(`select * from companies`);
    expect(rows).toHaveLength(0);
    const error = await attempt(`insert into companies (name) values ('Stranger Co')`);
    await asPostgres();
    expect(error).toMatch(/row-level security/i);
  });

  it("the owner can create company, contact, document, request and audit rows", async () => {
    await asRole("authenticated", OWNER_ID);
    const company = await db.query<{ id: string }>(
      `insert into companies (name, hq_city, hq_state) values ('Dummy Test Co', 'Dallas', 'TX') returning id`,
    );
    const companyId = company.rows[0].id;
    const contact = await db.query<{ id: string }>(
      `insert into contacts (company_id, name, email) values ($1, 'Dummy Contact', 'contact@example.com') returning id`,
      [companyId],
    );
    const contactId = contact.rows[0].id;
    const doc = await db.query<{ id: string }>(
      `insert into documents (company_id, kind, file_name, storage_path, sha256)
       values ($1, 'other', 'test.pdf', 'companies/x/test.pdf', $2) returning id`,
      [companyId, HASH],
    );
    expect(doc.rows).toHaveLength(1);
    const request = await db.query<{ id: string }>(
      `insert into signature_requests (company_id, contact_id, template_sha256, token_hash, expires_at)
       values ($1, $2, $3, $4, now() + interval '14 days') returning id`,
      [companyId, contactId, HASH, "b".repeat(64)],
    );
    expect(request.rows).toHaveLength(1);
    const audit = await attempt(
      `insert into audit_log (actor, company_id, signature_request_id, action, detail)
       values ('owner:test', $1, $2, 'link_created', '{}'::jsonb)`,
      [companyId, request.rows[0].id],
    );
    await asPostgres();
    expect(audit).toBeNull();
  });
});

describe("constraints", () => {
  it("rejects a status outside the agreed list", async () => {
    await asPostgres();
    const error = await attempt(
      `insert into signature_requests (company_id, contact_id, template_sha256, token_hash, status, expires_at)
       select c.company_id, c.id, $1, $2, 'signed-ish', now() from contacts c limit 1`,
      [HASH, "c".repeat(64)],
    );
    expect(error).toMatch(/check constraint/i);
  });

  it("rejects a token hash that is not a 64 character hex digest", async () => {
    await asPostgres();
    const error = await attempt(
      `insert into signature_requests (company_id, contact_id, template_sha256, token_hash, expires_at)
       select c.company_id, c.id, $1, 'not-a-hash', now() from contacts c limit 1`,
      [HASH],
    );
    expect(error).toMatch(/check constraint/i);
  });

  it("rejects a document kind outside the agreed list", async () => {
    await asPostgres();
    const error = await attempt(
      `insert into documents (company_id, kind, file_name, storage_path, sha256)
       select id, 'contract', 'x.pdf', 'p/x.pdf', $1 from companies limit 1`,
      [HASH],
    );
    expect(error).toMatch(/check constraint/i);
  });
});

describe("milestone 2: deals, notes, tasks", () => {
  const OTHER_COMPANY = "44444444-4444-4444-8444-444444444444";
  let companyId = "";
  let contactId = "";
  let dealId = "";

  it("adds status, phone and source to companies, defaulting status to prospect", async () => {
    await asPostgres();
    const { rows } = await db.query<{ status: string }>(
      `insert into companies (name, phone, source) values ('M2 Co', '214-555-0100', 'referral') returning status`,
    );
    expect(rows[0].status).toBe("prospect");
    expect(await attempt(`insert into companies (name, status) values ('Bad Co', 'friend')`)).toMatch(/check constraint/i);
  });

  it("the owner can create a deal, note and task linked to a company", async () => {
    await asRole("authenticated", OWNER_ID);
    companyId = (await db.query<{ id: string }>(`insert into companies (name) values ('Pipeline Co') returning id`)).rows[0].id;
    contactId = (
      await db.query<{ id: string }>(`insert into contacts (company_id, name) values ($1, 'Pat Buyer') returning id`, [companyId])
    ).rows[0].id;
    const deal = await db.query<{ id: string; stage: string; closed_at: string | null }>(
      `insert into deals (company_id, contact_id, name, estimated_value) values ($1, $2, 'PM search', 25000) returning id, stage, closed_at`,
      [companyId, contactId],
    );
    dealId = deal.rows[0].id;
    expect(deal.rows[0].stage).toBe("new lead");
    expect(deal.rows[0].closed_at).toBeNull();

    const note = await attempt(`insert into notes (company_id, deal_id, body) values ($1, $2, 'Called Pat')`, [companyId, dealId]);
    expect(note).toBeNull();
    // A task linked only to a deal gets its company filled in.
    const task = await db.query<{ company_id: string; status: string }>(
      `insert into tasks (title, deal_id, due_date) values ('Send proposal', $1, current_date) returning company_id, status`,
      [dealId],
    );
    expect(task.rows[0]).toEqual({ company_id: companyId, status: "open" });
    const standalone = await attempt(`insert into tasks (title) values ('Update LinkedIn')`);
    await asPostgres();
    expect(standalone).toBeNull();
  });

  it("sets closed_at when a deal is won and clears it when reopened", async () => {
    await asPostgres();
    const won = await db.query<{ closed_at: string | null }>(`update deals set stage = 'won' where id = $1 returning closed_at`, [dealId]);
    expect(won.rows[0].closed_at).not.toBeNull();
    const reopened = await db.query<{ closed_at: string | null }>(
      `update deals set stage = 'proposal sent' where id = $1 returning closed_at`,
      [dealId],
    );
    expect(reopened.rows[0].closed_at).toBeNull();
    expect(await attempt(`update deals set stage = 'maybe' where id = $1`, [dealId])).toMatch(/check constraint/i);
  });

  it("sets completed_at when a task is done and clears it when reopened", async () => {
    await asPostgres();
    const done = await db.query<{ completed_at: string | null }>(
      `update tasks set status = 'done' where title = 'Send proposal' returning completed_at`,
    );
    expect(done.rows[0].completed_at).not.toBeNull();
    const open = await db.query<{ completed_at: string | null }>(
      `update tasks set status = 'open' where title = 'Send proposal' returning completed_at`,
    );
    expect(open.rows[0].completed_at).toBeNull();
  });

  it("rejects links to a contact or deal at a different company", async () => {
    await asPostgres();
    await db.query(`insert into companies (id, name) values ($1, 'Other Co')`, [OTHER_COMPANY]);
    expect(
      await attempt(`insert into deals (company_id, contact_id, name) values ($1, $2, 'Wrong')`, [OTHER_COMPANY, contactId]),
    ).toMatch(/different company/);
    expect(await attempt(`insert into notes (company_id, deal_id, body) values ($1, $2, 'x')`, [OTHER_COMPANY, dealId])).toMatch(
      /different company/,
    );
    expect(await attempt(`insert into notes (company_id, body) values ($1, '   ')`, [companyId])).toMatch(/check constraint/i);
  });

  it("hides deals, notes and tasks from non-owners and anonymous visitors", async () => {
    await asRole("authenticated", STRANGER_ID);
    for (const table of ["deals", "notes", "tasks"]) {
      const { rows } = await db.query(`select * from ${table}`);
      expect(rows, table).toHaveLength(0);
    }
    const write = await attempt(`insert into tasks (title) values ('Sneaky')`);
    await asPostgres();
    expect(write).toMatch(/row-level security/i);

    await asRole("anon");
    const anon = await attempt(`select * from deals`);
    await asPostgres();
    if (anon !== null) expect(anon).toMatch(/permission denied/i);
  });
});

describe("candidates, files and candidate agreements", () => {
  let candidateId = "";

  it("the owner can create a candidate with notes, tasks, files and an agreement link", async () => {
    await asRole("authenticated", OWNER_ID);
    const cand = await db.query<{ id: string; status: string }>(
      `insert into candidates (full_name, phone) values ('Jordan Rivera', '214-555-0199') returning id, status`,
    );
    candidateId = cand.rows[0].id;
    expect(cand.rows[0].status).toBe("new");

    expect(await attempt(`insert into notes (candidate_id, body) values ($1, 'Phone screen went well')`, [candidateId])).toBeNull();
    expect(await attempt(`insert into tasks (candidate_id, title) values ($1, 'Send agreement')`, [candidateId])).toBeNull();
    expect(
      await attempt(
        `insert into documents (candidate_id, kind, folder, file_name, storage_path, sha256, mime_type)
         values ($1, 'uploaded', 'resumes', 'resume.pdf', $2, $3, 'application/pdf')`,
        [candidateId, `candidates/${candidateId}/resume.pdf`, HASH],
      ),
    ).toBeNull();
    expect(
      await attempt(
        `insert into candidate_agreements (candidate_id, template_sha256, token_hash, expires_at)
         values ($1, $2, $3, now() + interval '14 days')`,
        [candidateId, HASH, "d".repeat(64)],
      ),
    ).toBeNull();
    expect(
      await attempt(`insert into audit_log (actor, candidate_id, action) values ('owner:test', $1, 'candidate_created')`, [candidateId]),
    ).toBeNull();
    await asPostgres();
  });

  it("requires every file and note to belong to a company or candidate", async () => {
    await asPostgres();
    expect(
      await attempt(
        `insert into documents (kind, file_name, storage_path, sha256) values ('uploaded', 'x.pdf', 'orphan/x.pdf', $1)`,
        [HASH],
      ),
    ).toMatch(/documents_belongs_to_record/);
    expect(await attempt(`insert into notes (body) values ('orphan')`)).toMatch(/notes_belongs_to_record/);
  });

  it("checks folders, kinds, candidate statuses and agreement statuses", async () => {
    await asPostgres();
    expect(
      await attempt(
        `insert into documents (candidate_id, kind, folder, file_name, storage_path, sha256) values ($1, 'uploaded', 'junk', 'x', 'p/y', $2)`,
        [candidateId, HASH],
      ),
    ).toMatch(/check constraint/i);
    expect(
      await attempt(
        `insert into documents (candidate_id, kind, folder, file_name, storage_path, sha256) values ($1, 'contract', 'other', 'x', 'p/z', $2)`,
        [candidateId, HASH],
      ),
    ).toMatch(/check constraint/i);
    expect(await attempt(`update candidates set status = 'hot' where id = $1`, [candidateId])).toMatch(/check constraint/i);
    expect(await attempt(`update candidate_agreements set status = 'fully executed'`)).toMatch(/check constraint/i);
  });

  it("hides candidates and their agreements from non-owners", async () => {
    await asRole("authenticated", STRANGER_ID);
    for (const table of ["candidates", "candidate_agreements"]) {
      const { rows } = await db.query(`select * from ${table}`);
      expect(rows, table).toHaveLength(0);
    }
    const write = await attempt(`insert into candidates (full_name) values ('Sneaky')`);
    await asPostgres();
    expect(write).toMatch(/row-level security/i);
  });
});

describe("agent API keys table", () => {
  it("stores only hashes and hides keys from non-owners", async () => {
    await asRole("authenticated", OWNER_ID);
    expect(await attempt(`insert into api_keys (name, key_prefix, key_hash) values ('Chad', 'bpcrm_abc', $1)`, ["f".repeat(64)])).toBeNull();
    expect(await attempt(`insert into api_keys (name, key_prefix, key_hash) values ('Bad', 'x', 'plaintext-key')`)).toMatch(/check constraint/i);
    await asRole("authenticated", STRANGER_ID);
    const { rows } = await db.query(`select * from api_keys`);
    await asPostgres();
    expect(rows).toHaveLength(0);
  });
});

describe("audit log is append only", () => {
  it("rejects UPDATE, DELETE and TRUNCATE, even for the database owner role", async () => {
    await asPostgres();
    const { rows } = await db.query<{ count: string }>(`select count(*)::text as count from audit_log`);
    expect(Number(rows[0].count)).toBeGreaterThan(0);

    expect(await attempt(`update audit_log set action = 'tampered'`)).toMatch(/append-only/);
    expect(await attempt(`delete from audit_log`)).toMatch(/append-only/);
    expect(await attempt(`truncate audit_log`)).toMatch(/append-only/);

    const after = await db.query<{ count: string }>(`select count(*)::text as count from audit_log`);
    expect(after.rows[0].count).toBe(rows[0].count);
  });
});
