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
