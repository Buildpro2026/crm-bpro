-- BuildPro CRM, Milestone 1: foundation and client document flow.
--
-- Additive by design. Later milestones add tables and columns; they do not
-- rename or drop anything created here. Every table has row level security
-- enabled. Owner access is granted through public.is_owner(), so a signed-in
-- user with no row in public.profiles can read and write nothing.
--
-- Client signing never touches these tables from the browser. The signing
-- page runs on the server with the service role key after validating the
-- token, and it is the only writer of client-side audit entries.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: the owner record, linked to Supabase Auth. Owner only for now.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Owner membership check used by every owner-facing policy.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- Lee Chandler is the only owner. The Auth user with this address gets the
-- profile row; any other Auth user gets no profile and therefore no access.
create or replace function public.handle_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'lchandler@buildprorecruiters.com' then
    insert into public.profiles (id, email, full_name, title)
    values (new.id, lower(new.email), 'Lee Chandler', 'Owner')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_owner
  after insert on auth.users
  for each row execute function public.handle_owner_signup();

-- If the owner Auth account already exists when this migration runs, link it.
insert into public.profiles (id, email, full_name, title)
select u.id, lower(u.email), 'Lee Chandler', 'Owner'
from auth.users u
where lower(u.email) = 'lchandler@buildprorecruiters.com'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  website     text,
  hq_city     text,
  hq_state    text,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete restrict,
  name        text not null,
  title       text,
  email       text,
  phone       text,
  role_note   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contacts_company_id_idx on public.contacts (company_id);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents: metadata for every file in the private "documents" bucket.
-- The file itself is reached only through short-lived signed URLs issued by
-- the application.
-- ---------------------------------------------------------------------------

create table public.documents (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies (id) on delete restrict,
  kind                   text not null
                           check (kind in ('template', 'uploaded', 'executed agreement', 'other')),
  file_name              text not null,
  storage_path           text not null unique,
  sha256                 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes             integer,
  mime_type              text not null default 'application/pdf',
  signature_request_id   uuid,  -- foreign key added below, once signature_requests exists
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index documents_company_id_idx on public.documents (company_id);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- signature_requests: one signing packet sent to one contact.
-- Only a SHA-256 hash of the access token is stored, never the token itself.
-- ---------------------------------------------------------------------------

create table public.signature_requests (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies (id) on delete restrict,
  contact_id                  uuid not null references public.contacts (id) on delete restrict,
  template_key                text not null default 'client_representation_agreement',
  template_version            text not null default 'v1',
  template_sha256             text not null check (template_sha256 ~ '^[0-9a-f]{64}$'),
  intake_form_key             text not null default 'client_search_information',
  intake_form_version         text not null default 'v1',
  token_hash                  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status                      text not null default 'created'
                                check (status in ('created', 'viewed', 'client signed',
                                                  'fully executed', 'expired', 'revoked')),
  expires_at                  timestamptz not null,
  revoked_at                  timestamptz,
  form_answers                jsonb,
  form_submitted_at           timestamptz,
  signer_name                 text,
  signer_title                text,
  signer_email                text,
  signature_method            text check (signature_method in ('drawn', 'typed')),
  signature_storage_path      text,
  client_signed_at            timestamptz,
  ip_address                  text,
  user_agent                  text,
  client_signed_document_id   uuid references public.documents (id) on delete restrict,
  countersigned_at            timestamptz,
  countersigned_by            uuid references public.profiles (id) on delete set null,
  executed_document_id        uuid references public.documents (id) on delete restrict,
  created_by                  uuid references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index signature_requests_company_id_idx on public.signature_requests (company_id);
create index signature_requests_contact_id_idx on public.signature_requests (contact_id);

create trigger signature_requests_set_updated_at
  before update on public.signature_requests
  for each row execute function public.set_updated_at();

alter table public.documents
  add constraint documents_signature_request_id_fkey
  foreign key (signature_request_id) references public.signature_requests (id) on delete restrict;

create index documents_signature_request_id_idx on public.documents (signature_request_id);

-- ---------------------------------------------------------------------------
-- audit_log: append only. Updates, deletes and truncates are rejected.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id                     uuid primary key default gen_random_uuid(),
  actor                  text not null,               -- 'owner:<uuid>', 'client', or 'system'
  company_id             uuid references public.companies (id) on delete restrict,
  signature_request_id   uuid references public.signature_requests (id) on delete restrict,
  action                 text not null,
  detail                 jsonb not null default '{}'::jsonb,
  ip_address             text,
  user_agent             text,
  created_at             timestamptz not null default now()
);

create index audit_log_company_idx on public.audit_log (company_id, created_at);
create index audit_log_request_idx on public.audit_log (signature_request_id, created_at);

create or replace function public.reject_audit_log_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.reject_audit_log_change();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.reject_audit_log_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.companies          enable row level security;
alter table public.contacts           enable row level security;
alter table public.documents          enable row level security;
alter table public.signature_requests enable row level security;
alter table public.audit_log          enable row level security;

create policy profiles_owner_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy companies_owner_all on public.companies
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy contacts_owner_all on public.contacts
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy documents_owner_all on public.documents
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy signature_requests_owner_all on public.signature_requests
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy audit_log_owner_select on public.audit_log
  for select to authenticated
  using (public.is_owner());

create policy audit_log_owner_insert on public.audit_log
  for insert to authenticated
  with check (public.is_owner());

-- No update or delete policy exists on audit_log, and the trigger above
-- rejects them anyway. Anonymous visitors have no policies at all.

-- Defense in depth: the anonymous role gets no table or function privileges.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket. No policies are granted on storage.objects,
-- so only the service role (server side) can read or write files. Browsers
-- get files only through signed URLs issued by the application.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;
