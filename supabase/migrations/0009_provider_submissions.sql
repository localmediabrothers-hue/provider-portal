-- Front Door: landlords/providers can list their own empty rooms from the
-- public site, without the operator having to visit the property first.
--
-- A provider enters their phone number and fills in a short form (room
-- count, postcode, which fixed features apply) on the public site. That's
-- saved here as a pending lead - it never goes near the tenant-facing
-- properties table directly. The operator reviews leads in the portal and,
-- same as every property today, still builds the real listing by hand
-- (photos, exact address, per-room pricing) using what the provider
-- already gave, rather than this auto-publishing anything itself.

create table if not exists provider_submissions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  rooms_count int,
  postcode text,
  features text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'declined')),
  operator_note text not null default '',
  created_at timestamptz not null default now()
);

comment on column provider_submissions.rooms_count is
  'How many rooms the provider said their property has - a headline number, not yet broken into real priced rooms the way properties.rooms are.';
comment on column provider_submissions.postcode is
  'Rough location only, from the provider''s own form answer - not validated or geocoded here.';
comment on column provider_submissions.features is
  'Picked from the same fixed list as properties.features (parking, pets_allowed, garden, etc.) - whichever ones the provider said apply.';
comment on column provider_submissions.status is
  'pending: just came in. contacted: operator has been in touch. approved: a real property has been created from this lead. declined: not going ahead.';
comment on column provider_submissions.operator_note is
  'Free text for whatever the operator wants to remember about this lead after calling or messaging the provider.';

create index if not exists provider_submissions_status_idx on provider_submissions(status, created_at);

alter table provider_submissions enable row level security;

-- Public (no login) - this is the whole point, a provider fills the form
-- in on the open site before ever touching the portal.
drop policy if exists "anyone can submit a provider lead" on provider_submissions;
create policy "anyone can submit a provider lead" on provider_submissions
  for insert with check (true);

-- Only the operator can read or update leads back - same shape as every
-- other "public submits, provider reviews" table (enquiries, waitlist).
drop policy if exists "providers read submissions" on provider_submissions;
create policy "providers read submissions" on provider_submissions
  for select using (exists (select 1 from providers where id = auth.uid()));

drop policy if exists "providers update submissions" on provider_submissions;
create policy "providers update submissions" on provider_submissions
  for update using (exists (select 1 from providers where id = auth.uid()));
