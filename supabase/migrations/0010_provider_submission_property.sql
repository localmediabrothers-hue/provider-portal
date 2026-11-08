-- Front Door: a provider's submission now creates a real (but inactive)
-- property and rooms straight away, instead of just sitting as answers for
-- the operator to re-type into a new listing by hand.
--
-- The property is inserted with active = false - properties.active
-- defaults to true at the database level, so submit-provider-listing must
-- set this explicitly, or a draft would go live the moment it's created.
-- Rooms are created available = false for the same reason: even if the
-- operator forgets and flips the property active before finishing it,
-- nothing with a placeholder price can be asked about.

alter table provider_submissions
  add column if not exists property_id uuid references properties(id) on delete set null;

comment on column provider_submissions.property_id is
  'The draft property (active = false) created from this submission, if any. Null for submissions made before this existed, or if the property was later deleted.';
