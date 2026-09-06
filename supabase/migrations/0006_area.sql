-- Front Door: a dedicated area/town field.
--
-- Search on the public site only ever checked the street address and title,
-- and an address like "53 Charminster Drive, CV3 5AE" never spells out the
-- city — so searching "Coventry" matched nothing. A separate field fixes
-- that properly instead of asking landlords to cram the city into the
-- address line.

alter table properties
  add column if not exists area text not null default '';

comment on column properties.area is
  'Town/city/area, e.g. "Coventry" or "Peckham" — searched separately from the street address so a city search actually matches.';
