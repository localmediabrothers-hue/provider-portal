-- Front Door: lightweight, first-party analytics. No third-party script, no
-- cookies, nothing leaves this Supabase project - just a log of what
-- happened (page views, property views, enquiries submitted, provider
-- listings submitted, map searches) so the operator can actually see what's
-- working on the public site.
--
-- Nothing anonymous ever writes to this table directly: the public site
-- always goes through the track-event edge function, which uses the
-- service-role key - so there's no anonymous insert policy here at all,
-- only a read policy for the operator.

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on analytics_events (created_at desc);
create index if not exists analytics_events_type_idx on analytics_events (event_type);

alter table analytics_events enable row level security;

create policy "Providers can read analytics" on analytics_events
  for select
  to authenticated
  using (true);
