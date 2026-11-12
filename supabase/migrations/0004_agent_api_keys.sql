-- BuildPro CRM: API keys for BuildPro's own agents (Chad, Muse), which use
-- the CRM instead of HubSpot. Additive only.
--
-- Only a SHA-256 hash of each key is stored. The key is shown once, when it
-- is created on the owner's API keys page. Agent requests are checked on the
-- server and run with the service role, so no RLS policy grants agents
-- direct table access.

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 100),
  key_prefix    text not null,
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

alter table public.api_keys enable row level security;

create policy api_keys_owner_all on public.api_keys
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

revoke all on public.api_keys from anon;
