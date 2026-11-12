-- BuildPro CRM, Milestone 2: CRM core.
--
-- Additive only. Adds company status and phone, a deals pipeline, notes, and
-- tasks. Nothing from 0001 is renamed or dropped. Every new table has row
-- level security, and only the owner (public.is_owner()) can read or write.

-- ---------------------------------------------------------------------------
-- companies: relationship status, main phone, lead source
-- ---------------------------------------------------------------------------

alter table public.companies
  add column status text not null default 'prospect'
    check (status in ('prospect', 'active client', 'past client', 'inactive')),
  add column phone  text,
  add column source text;

create index companies_status_idx on public.companies (status);

-- ---------------------------------------------------------------------------
-- deals: business development pipeline, one row per opportunity.
-- Stages are fixed here and mirrored in src/lib/crm.ts.
-- ---------------------------------------------------------------------------

create table public.deals (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete restrict,
  contact_id           uuid references public.contacts (id) on delete restrict,
  name                 text not null check (length(name) between 1 and 200),
  stage                text not null default 'new lead'
                         check (stage in ('new lead', 'contacted', 'discovery meeting', 'proposal sent',
                                          'agreement sent', 'won', 'lost')),
  position_title       text,
  positions_count      integer not null default 1 check (positions_count between 1 and 500),
  estimated_value      numeric(12, 2) check (estimated_value is null or estimated_value >= 0),
  fee_percent          numeric(5, 2) check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 100)),
  expected_close_date  date,
  closed_at            timestamptz,
  lost_reason          text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index deals_company_id_idx on public.deals (company_id);
create index deals_contact_id_idx on public.deals (contact_id);
create index deals_stage_idx on public.deals (stage);

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- closed_at follows the stage: set when a deal reaches won or lost, cleared
-- when it is reopened.
create or replace function public.deals_track_closed()
returns trigger
language plpgsql
as $$
begin
  if new.stage in ('won', 'lost') then
    if tg_op = 'INSERT' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif old.stage is distinct from new.stage then
      new.closed_at := now();
    else
      new.closed_at := coalesce(new.closed_at, old.closed_at, now());
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger deals_track_closed
  before insert or update on public.deals
  for each row execute function public.deals_track_closed();

-- ---------------------------------------------------------------------------
-- notes: free text timeline entries on a company, optionally tied to one of
-- its contacts or deals.
-- ---------------------------------------------------------------------------

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete restrict,
  contact_id  uuid references public.contacts (id) on delete restrict,
  deal_id     uuid references public.deals (id) on delete restrict,
  body        text not null check (length(btrim(body)) between 1 and 10000),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_company_idx on public.notes (company_id, created_at desc);
create index notes_contact_idx on public.notes (contact_id);
create index notes_deal_idx on public.notes (deal_id);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks: to-dos with an optional due date. A task may stand alone or link to
-- a company, and through it to a contact or deal.
-- ---------------------------------------------------------------------------

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 300),
  details       text,
  due_date      date,
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status        text not null default 'open' check (status in ('open', 'done')),
  completed_at  timestamptz,
  company_id    uuid references public.companies (id) on delete restrict,
  contact_id    uuid references public.contacts (id) on delete restrict,
  deal_id       uuid references public.deals (id) on delete restrict,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tasks_open_due_idx on public.tasks (status, due_date);
create index tasks_company_idx on public.tasks (company_id);
create index tasks_contact_idx on public.tasks (contact_id);
create index tasks_deal_idx on public.tasks (deal_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create or replace function public.tasks_track_completed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_track_completed
  before insert or update on public.tasks
  for each row execute function public.tasks_track_completed();

-- ---------------------------------------------------------------------------
-- Link consistency for deals, notes and tasks. A linked contact or deal must
-- belong to the same company. When a company is not given, it is filled in
-- from the contact or deal.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_company_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  link_company uuid;
  linked_deal uuid;
begin
  -- deals rows have no deal_id column, so read it through jsonb.
  linked_deal := (to_jsonb(new) ->> 'deal_id')::uuid;
  if linked_deal is not null then
    select company_id into link_company from public.deals where id = linked_deal;
    if link_company is null then
      raise exception 'linked deal not found';
    end if;
    if new.company_id is null then
      new.company_id := link_company;
    elsif new.company_id <> link_company then
      raise exception 'linked deal belongs to a different company';
    end if;
  end if;

  if new.contact_id is not null then
    select company_id into link_company from public.contacts where id = new.contact_id;
    if link_company is null then
      raise exception 'linked contact not found';
    end if;
    if new.company_id is null then
      new.company_id := link_company;
    elsif new.company_id <> link_company then
      raise exception 'linked contact belongs to a different company';
    end if;
  end if;

  return new;
end;
$$;

create trigger deals_enforce_company_links
  before insert or update on public.deals
  for each row execute function public.enforce_company_links();

create trigger notes_enforce_company_links
  before insert or update on public.notes
  for each row execute function public.enforce_company_links();

create trigger tasks_enforce_company_links
  before insert or update on public.tasks
  for each row execute function public.enforce_company_links();

-- ---------------------------------------------------------------------------
-- Row level security: owner only.
-- ---------------------------------------------------------------------------

alter table public.deals enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;

create policy deals_owner_all on public.deals
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy notes_owner_all on public.notes
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy tasks_owner_all on public.tasks
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

revoke all on public.deals, public.notes, public.tasks from anon;
revoke all on function public.deals_track_closed() from anon;
revoke all on function public.tasks_track_completed() from anon;
revoke all on function public.enforce_company_links() from anon;
