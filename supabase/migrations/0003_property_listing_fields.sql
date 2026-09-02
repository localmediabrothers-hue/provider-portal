-- The public Front Door site now reads properties straight from this table
-- (front-door/index.html's loadLiveProperties()) instead of using its old
-- hardcoded example list. It needs a few fields the dashboard didn't collect
-- yet — this adds them without touching what's already there.

alter table properties
  add column if not exists type text not null default 'flat'
    check (type in ('flat', 'room', 'house', 'studio')),
  add column if not exists blurb text not null default '',
  add column if not exists monthly_rent int;

comment on column properties.monthly_rent is
  'Informational only, shown to tenants as "covered by your benefit" — never charged to them. Null hides that line.';
