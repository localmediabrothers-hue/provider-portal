-- Front Door: individual rooms within a property, fixed property features,
-- and letting an enquiry point at one specific room (or none, for "I'd like
-- to view the whole property and decide on the day").
--
-- Every property now has one or more rooms underneath it - even a studio is
-- modelled as a property with a single room - so price and availability live
-- on the room, not the property. The property itself stays the shell:
-- address, photos, features, and a master on/off switch.

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  label text not null default '',
  room_type text not null default 'double' check (room_type in ('single', 'double')),
  ensuite boolean not null default false,
  size_sqm numeric,
  weekly_service_charge numeric not null,
  available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on column rooms.label is
  'Optional short name, e.g. "Room 2" or "Back double" - blank is fine, the tenant site falls back to "Room 1", "Room 2" by position.';
comment on column rooms.weekly_service_charge is
  'This room''s own weekly cost - rooms in the same property can be priced differently (an ensuite double vs a single, say).';

create index if not exists rooms_property_id_idx on rooms(property_id, sort_order);

alter table rooms enable row level security;

drop policy if exists "providers manage rooms on their own properties" on rooms;
create policy "providers manage rooms on their own properties" on rooms
  for all using (
    exists (select 1 from properties p where p.id = property_id and p.provider_id = auth.uid())
  )
  with check (
    exists (select 1 from properties p where p.id = property_id and p.provider_id = auth.uid())
  );

-- Same shape as "anyone can read active properties" - the public site needs
-- to show room-by-room availability on a listing without any login.
drop policy if exists "anyone can read rooms on active properties" on rooms;
create policy "anyone can read rooms on active properties" on rooms
  for select using (
    exists (select 1 from properties p where p.id = property_id and p.active = true)
  );

-- A fixed tick-list of property features, chosen rather than freely typed so
-- the public site can display them consistently. Stored as a plain text
-- array - the fixed list of allowed values lives in the portal's UI, not
-- enforced in the database, so adding a new feature later never needs a
-- migration.
alter table properties
  add column if not exists features text[] not null default '{}';

-- Price now lives on each room, not the property as a whole - this was
-- "not null check (between 10 and 30)" when a property was always a single
-- rentable unit, which no longer holds once one property can have several
-- differently-priced rooms underneath it.
alter table properties
  alter column weekly_service_charge drop not null,
  drop constraint if exists properties_weekly_service_charge_check;

comment on column properties.features is
  'Picked from a fixed list in the portal (e.g. parking, pets_allowed, garden) - not free text, so the public site can render them consistently.';

-- An enquiry can now name the specific room someone wants to view, or leave
-- it blank for "view the whole property and decide on the day" - both are
-- still a single enquiry, just with or without a room picked.
alter table enquiries
  add column if not exists room_id uuid references rooms(id) on delete set null;

comment on column enquiries.room_id is
  'The specific room this enquiry is about. Null means "view the whole property" - the tenant wants to see every available room in person before choosing.';

-- Every property that already exists needs at least one room so nothing on
-- the live site breaks: one room per property, carrying over its old price,
-- bedroom count folded into whether it reads as a single or double, and
-- availability matching whether the property itself is currently active.
-- The provider can go back in and split these into real rooms with accurate
-- sizes whenever they're ready - this just keeps today's listings working.
insert into rooms (property_id, room_type, weekly_service_charge, available, sort_order)
select
  p.id,
  case when coalesce(p.bedrooms, 1) <= 1 then 'single' else 'double' end,
  p.weekly_service_charge,
  p.active,
  0
from properties p
where not exists (select 1 from rooms r where r.property_id = p.id);
