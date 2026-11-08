-- Front Door: a few more whole-property facts the provider form now asks
-- for (toilets, floors, living rooms), alongside the room type the
-- property already has.
--
-- These are plain facts about the property, not tenant-facing pricing or
-- availability, so they get simple nullable columns rather than their own
-- table - null just means "not given yet" for anything created before this
-- existed, or any property added by hand in the portal without filling
-- them in.

alter table properties
  add column if not exists toilets int,
  add column if not exists floors int,
  add column if not exists living_rooms int;

comment on column properties.toilets is 'How many toilets/bathrooms the property has - whole-property fact, not per-room.';
comment on column properties.floors is 'How many floors/storeys the property has.';
comment on column properties.living_rooms is 'How many living rooms/communal sitting rooms the property has.';
