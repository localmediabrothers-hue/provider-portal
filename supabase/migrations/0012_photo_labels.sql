-- Front Door: a label per photo (e.g. "Room 1", "Kitchen"), so a provider's
-- uploaded photos aren't just an unlabelled gallery for the operator to
-- guess at.
--
-- Kept as a separate parallel array rather than changing how photo_urls
-- itself is stored, so nothing that already reads photo_urls as a plain
-- list of image URLs (the portal, the public site) needs to change. Index
-- N in photo_labels is the label for index N in photo_urls; a property
-- with more photos than labels (or none at all) just has blank labels for
-- the rest.

alter table properties
  add column if not exists photo_labels text[] not null default '{}';

comment on column properties.photo_labels is
  'One label per photo_urls entry, same order, e.g. "Room 1", "Kitchen" - blank/missing entries just mean no label was given for that photo.';
