-- Front Door provider portal — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`) once the project exists.

create extension if not exists "pgcrypto";

-- One row per provider (landlord/agent). Linked 1:1 to a Supabase Auth user via id.
create table providers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  contact_email text not null,
  contact_phone text,
  created_at timestamptz not null default now()
);

-- Mirrors the listings shown on the public Front Door site. `slug` matches the
-- id used in front-door/index.html's HOMES array so enquiries from the public
-- site can be linked to the right row without a separate migration step.
create table properties (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  provider_id uuid not null references providers(id) on delete cascade,
  title text not null,
  address text not null,
  weekly_service_charge int not null check (weekly_service_charge between 10 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type enquiry_status as enum ('new', 'approved', 'declined', 'form_sent');

-- One row per "Ask to view this" submission from the public site.
create table enquiries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tenant_name text not null,
  tenant_phone text not null,
  tenant_email text,
  best_time text,
  message text,
  status enquiry_status not null default 'new',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references providers(id)
);

-- Audit trail: what was actually sent to the tenant when a provider approved them.
create table eligibility_sends (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  jotform_url text not null,
  channel text not null check (channel in ('email', 'sms', 'email+sms')),
  sent_at timestamptz not null default now()
);

alter table providers enable row level security;
alter table properties enable row level security;
alter table enquiries enable row level security;
alter table eligibility_sends enable row level security;

-- Providers can only ever see their own row.
create policy "providers read own row" on providers
  for select using (auth.uid() = id);

-- Providers can only see and manage their own properties.
create policy "providers read own properties" on properties
  for select using (auth.uid() = provider_id);
create policy "providers insert own properties" on properties
  for insert with check (auth.uid() = provider_id);
create policy "providers update own properties" on properties
  for update using (auth.uid() = provider_id);

-- The public site (using the anon key) needs to look up a property's id from
-- its slug to file an enquiry against it — this is what lets "Ask to view
-- this" on Front Door find the right property without exposing anything a
-- visitor couldn't already see on the listing itself.
create policy "anyone can read active properties" on properties
  for select using (active = true);

-- Providers can only see enquiries against their own properties.
create policy "providers read own enquiries" on enquiries
  for select using (
    exists (select 1 from properties p where p.id = property_id and p.provider_id = auth.uid())
  );

-- The public site (using the anon key) may create enquiries but never read them back —
-- this is what makes the "Ask to view this" form on Front Door work without exposing
-- one tenant's contact details to another visitor.
create policy "anyone can submit an enquiry" on enquiries
  for insert with check (true);

-- Providers may decline an enquiry on their own property directly from the
-- dashboard — but the `with check` clause only permits the resulting status to be
-- 'declined'. Setting status to 'approved' this way is rejected by Postgres, so
-- approving is only ever possible through the approve-enquiry Edge Function below,
-- which is deliberate: it's the only place the Jotform/Resend/Twilio secrets are
-- used, and the only place a tenant's eligibility form is ever triggered.
create policy "providers decline own enquiries" on enquiries
  for update using (
    exists (select 1 from properties p where p.id = property_id and p.provider_id = auth.uid())
  )
  with check (status = 'declined');
