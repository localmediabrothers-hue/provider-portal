-- Front Door: some properties are transitional accommodation, some are
-- supported housing - different eligibility (transitional always needs two
-- benefits claimed, supported always needs one), shown to tenants as a
-- pair of badges on the listing. Defaults to transitional, the site's
-- long-standing norm, so nothing existing changes meaning on migration.

alter table properties
  add column if not exists housing_model text not null default 'transitional'
  check (housing_model in ('transitional', 'supported'));

comment on column properties.housing_model is
  'transitional (always "two benefits needed") or supported (always "one benefit needed") - shown to tenants as badges on the listing.';
