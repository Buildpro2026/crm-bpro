-- BuildPro CRM: candidates, file folders, and the online candidate agreement.
--
-- Additive. Relaxes two not-null rules (documents.company_id, notes.company_id)
-- so files and notes can belong to a candidate instead of a company, and
-- replaces the documents.kind check with a wider list. Nothing is dropped.

-- ---------------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------------

create table public.candidates (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null check (length(btrim(full_name)) between 1 and 200),
  email                text,
  phone                text,
  city                 text,
  state                text,
  current_title        text,
  current_employer     text,
  desired_title        text,
  desired_salary       numeric(12, 2) check (desired_salary is null or desired_salary >= 0),
  linkedin_url         text,
  source               text,
  status               text not null default 'new'
                         check (status in ('new', 'screening', 'active', 'submitted', 'interviewing', 'offer',
                                           'placed', 'not a fit', 'do not contact')),
  text_opt_in          boolean,
  recent_submissions   text,
  background           text,
  agreement_signed_at  timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index candidates_status_idx on public.candidates (status);
create index candidates_name_idx on public.candidates (lower(full_name));

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents: candidate files and folders
-- ---------------------------------------------------------------------------

alter table public.documents alter column company_id drop not null;
alter table public.documents
  add column candidate_id uuid references public.candidates (id) on delete restrict,
  add column folder text not null default 'other'
    check (folder in ('client packet', 'agreements', 'search forms', 'job descriptions', 'invoices',
                      'resumes', 'applications', 'references', 'offer letters', 'correspondence', 'other'));
alter table public.documents
  add constraint documents_belongs_to_record check (company_id is not null or candidate_id is not null);

alter table public.documents drop constraint documents_kind_check;
alter table public.documents
  add constraint documents_kind_check
  check (kind in ('template', 'uploaded', 'executed agreement', 'other', 'generated', 'signed agreement'));

create index documents_candidate_id_idx on public.documents (candidate_id);

-- Milestone 1 signing files belong in the Agreements folder.
update public.documents set folder = 'agreements' where signature_request_id is not null;

-- ---------------------------------------------------------------------------
-- notes and tasks on candidates
-- ---------------------------------------------------------------------------

alter table public.notes alter column company_id drop not null;
alter table public.notes add column candidate_id uuid references public.candidates (id) on delete restrict;
alter table public.notes
  add constraint notes_belongs_to_record check (company_id is not null or candidate_id is not null);
create index notes_candidate_idx on public.notes (candidate_id, created_at desc);

alter table public.tasks add column candidate_id uuid references public.candidates (id) on delete restrict;
create index tasks_candidate_idx on public.tasks (candidate_id);

-- ---------------------------------------------------------------------------
-- audit_log: candidate events
-- ---------------------------------------------------------------------------

alter table public.audit_log add column candidate_id uuid references public.candidates (id) on delete restrict;
create index audit_log_candidate_idx on public.audit_log (candidate_id, created_at);

-- ---------------------------------------------------------------------------
-- candidate_agreements: online Candidate Representation Agreement links.
-- Only a SHA-256 hash of the access token is stored.
-- ---------------------------------------------------------------------------

create table public.candidate_agreements (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references public.candidates (id) on delete restrict,
  template_version    text not null default 'v1',
  template_sha256     text not null check (template_sha256 ~ '^[0-9a-f]{64}$'),
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status              text not null default 'created'
                        check (status in ('created', 'viewed', 'signed', 'expired', 'revoked')),
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  answers             jsonb,
  signer_name         text,
  text_opt_in         boolean,
  signed_at           timestamptz,
  ip_address          text,
  user_agent          text,
  signed_document_id  uuid references public.documents (id) on delete restrict,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index candidate_agreements_candidate_idx on public.candidate_agreements (candidate_id, created_at desc);

create trigger candidate_agreements_set_updated_at
  before update on public.candidate_agreements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: owner only. The candidate signing page uses the
-- service role on the server after validating its token.
-- ---------------------------------------------------------------------------

alter table public.candidates enable row level security;
alter table public.candidate_agreements enable row level security;

create policy candidates_owner_all on public.candidates
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy candidate_agreements_owner_all on public.candidate_agreements
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

revoke all on public.candidates, public.candidate_agreements from anon;
