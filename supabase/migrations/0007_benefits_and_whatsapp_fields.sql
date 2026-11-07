-- Front Door: "claiming benefits" on both enquiry routes, plus the fields
-- the WhatsApp + manual-note workflow needs on the waiting list.
--
-- No SMS/Twilio involved anywhere here — messaging tenants is a manual,
-- free WhatsApp click-to-chat link the operator sends themselves from the
-- portal, so there is nothing to automate server-side beyond saving the
-- answer and letting the operator jot down what was agreed afterwards.

alter table enquiries
  add column if not exists claiming_benefits boolean;

comment on column enquiries.claiming_benefits is
  'Answer to "Are you claiming benefits? (not including Housing Benefit, as that does not count)" - null for enquiries made before this question existed.';

alter table waitlist_signups
  add column if not exists claiming_benefits boolean,
  add column if not exists operator_note text not null default '';

comment on column waitlist_signups.claiming_benefits is
  'Same question and wording as enquiries.claiming_benefits.';
comment on column waitlist_signups.operator_note is
  'What the provider jots down after messaging this person on WhatsApp - a manual record, since a plain WhatsApp chat cannot be logged automatically.';
comment on column waitlist_signups.notified is
  'Set true from the portal once the provider has sent this person a WhatsApp message about a property - a manual flag, not driven by any automated send.';

-- Marking someone "notified" and saving your own note both need an update
-- policy - only insert (the public form) and select (the provider) existed
-- before this.
drop policy if exists "providers update waitlist" on waitlist_signups;
create policy "providers update waitlist" on waitlist_signups
  for update using (exists (select 1 from providers where id = auth.uid()));
