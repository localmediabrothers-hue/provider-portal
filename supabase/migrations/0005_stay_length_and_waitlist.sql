-- Front Door: bedroom count and "last confirmed available" on properties
-- (both power filters and the honest-empty-state work on the public site),
-- plus a waiting list for when nothing matches.

alter table properties
  add column if not exists bedrooms int,
  add column if not exists last_confirmed_at timestamptz not null default now(),
  add column if not exists max_stay_note text not null default '';

comment on column properties.last_confirmed_at is
  'Set whenever the provider confirms this property is still genuinely available. Shown to tenants as "last checked" so listings never go stale silently.';
comment on column properties.max_stay_note is
  'Plain-English answer to "how long can I stay?" — e.g. "Up to 2 years, reviewed with you along the way." Blank hides the line.';

-- One row per "let me know when something comes up" signup, for a tenant
-- (or whoever is helping them) when nothing currently matches what they need.
create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  area text,
  bedrooms_needed int,
  note text,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table waitlist_signups enable row level security;

drop policy if exists "anyone can join the waiting list" on waitlist_signups;
create policy "anyone can join the waiting list" on waitlist_signups
  for insert with check (true);

-- Only the provider (you) can read the list back — matches how enquiries work.
drop policy if exists "providers read waitlist" on waitlist_signups;
create policy "providers read waitlist" on waitlist_signups
  for select using (exists (select 1 from providers where id = auth.uid()));
