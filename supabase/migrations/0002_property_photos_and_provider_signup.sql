-- Lets a newly logged-in provider set up their own profile, and adds
-- property photos (a public storage bucket) so the "Add property" screen
-- in the dashboard can actually be used. Run this in the SQL editor the
-- same way as 0001_init.sql.

-- 0001 only let a provider READ their own row; there was no way for a new
-- sign-in to ever create one.
create policy "providers can create own row" on providers
  for insert with check (auth.uid() = id);

create policy "providers can update own row" on providers
  for update using (auth.uid() = id);

alter table properties add column if not exists photo_urls text[] not null default '{}';

-- Public bucket: property photos need to be visible on the public Front Door
-- site without anyone being logged in.
insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', true)
on conflict (id) do nothing;

create policy "anyone can view property photos" on storage.objects
  for select using (bucket_id = 'property-photos');

-- Providers may only upload/delete inside a folder named after their own
-- user id (the dashboard uploads to `${auth.uid()}/...`), so one provider
-- can never overwrite another's photos.
create policy "providers can upload their own property photos" on storage.objects
  for insert with check (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "providers can delete their own property photos" on storage.objects
  for delete using (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
