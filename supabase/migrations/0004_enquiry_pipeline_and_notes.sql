-- Until now an enquiry could only be new/approved/declined, so the system
-- forgot about people the moment the eligibility form went out — it couldn't
-- tell you whether they filled it in, whether they passed, or whether they
-- ever moved in. This adds the real stages, plus notes so a provider can
-- record what actually happened ("rang Tuesday, no answer").

-- Status becomes plain text with a check constraint rather than an enum:
-- adding a stage later is then a one-line change, where altering an enum
-- can't even run inside a normal transaction.
alter table enquiries alter column status drop default;
alter table enquiries alter column status type text using status::text;
alter table enquiries alter column status set default 'new';
drop type if exists enquiry_status;

alter table enquiries add constraint enquiries_status_check check (status in (
  'new',            -- just arrived, provider hasn't decided
  'approved',       -- provider said yes, eligibility form sent
  'form_returned',  -- tenant has filled the form in
  'eligible',       -- passed the eligibility check
  'not_eligible',   -- did not pass — we don't proceed
  'viewing_booked',
  'moved_in',
  'declined',       -- provider said no up front
  'withdrawn'       -- tenant dropped out or went elsewhere
));

-- "In this stage since…" without every bit of code having to remember to set it.
alter table enquiries add column if not exists status_changed_at timestamptz not null default now();

create or replace function set_status_changed_at() returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists enquiries_status_changed on enquiries;
create trigger enquiries_status_changed
  before update on enquiries
  for each row execute function set_status_changed_at();

-- Providers can now move an enquiry through the pipeline themselves, but
-- 'approved' is still deliberately absent from this list: approving is what
-- sends the tenant their eligibility form, so it stays reachable only through
-- the approve-enquiry function, which runs as service role and bypasses this.
drop policy if exists "providers decline own enquiries" on enquiries;
create policy "providers move own enquiries through the pipeline" on enquiries
  for update using (
    exists (select 1 from properties p where p.id = property_id and p.provider_id = auth.uid())
  )
  with check (status in (
    'form_returned', 'eligible', 'not_eligible', 'viewing_booked', 'moved_in', 'declined', 'withdrawn'
  ));

-- A dated trail per enquiry, rather than one notes box that gets overwritten.
create table enquiry_notes (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index enquiry_notes_enquiry_id_idx on enquiry_notes(enquiry_id, created_at);

alter table enquiry_notes enable row level security;

create policy "providers read notes on their own enquiries" on enquiry_notes
  for select using (
    exists (
      select 1 from enquiries e
      join properties p on p.id = e.property_id
      where e.id = enquiry_id and p.provider_id = auth.uid()
    )
  );

create policy "providers add notes to their own enquiries" on enquiry_notes
  for insert with check (
    provider_id = auth.uid()
    and exists (
      select 1 from enquiries e
      join properties p on p.id = e.property_id
      where e.id = enquiry_id and p.provider_id = auth.uid()
    )
  );
