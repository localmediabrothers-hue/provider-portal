# Front Door — provider portal

The system behind the "Ask to view this" button on the public Front Door
site. A tenant messages a landlord about a property; the landlord sees it
here and, if they're happy, clicks **Approve**, which sends the tenant a
personalised eligibility form (by email and text) and nothing before that.

## What's here

- `src/` — the dashboard itself (React + Vite + TypeScript + Tailwind)
- `supabase/migrations/0001_init.sql` — the database schema and access rules
- `supabase/functions/approve-enquiry/` — the one place the Jotform, Resend
  and Twilio keys are ever used. Approving only ever happens through this
  function, never directly from the browser — see the comment at the top of
  `0001_init.sql` for why that split matters.

## Setting it up from scratch

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free
   tier covers this comfortably to start).
2. **Run the schema.** Paste `supabase/migrations/0001_init.sql` into the
   Supabase SQL editor and run it. This creates the tables, and locks them
   down so a provider only ever sees their own properties and enquiries.
3. **Add your properties.** For each home on the public site, insert a row
   into `properties` whose `slug` matches that property's `id` in
   `front-door/index.html`'s `HOMES` array (e.g. slug `"3"` for `id: 3`).
   You'll need a `provider_id` — create the provider's login first (step 5)
   and use their user id.
4. **Deploy the Edge Function:**
   ```
   npx supabase login
   npx supabase link --project-ref your-project-ref
   npx supabase functions deploy approve-enquiry
   npx supabase secrets set \
     JOTFORM_FORM_ID=xxxxxxxxxxxxx \
     RESEND_API_KEY=re_xxx \
     TWILIO_ACCOUNT_SID=ACxxx \
     TWILIO_AUTH_TOKEN=xxx \
     TWILIO_FROM_NUMBER=+44xxxxxxxxxx
   ```
   Before this goes live, open `supabase/functions/approve-enquiry/index.ts`
   and update `buildJotformPrefillUrl` — the field names (`name3`, `phone4`,
   `property6`, `email5`) are placeholders. Open your actual eligibility form
   in Jotform, check each field's **Advanced → Unique Name**, and match them
   up.
5. **Create provider logins.** In the Supabase dashboard under
   Authentication → Users, add one user per provider (or invite them), then
   insert a matching row into the `providers` table with their name and
   contact details.
6. **Run the dashboard locally:**
   ```
   cp .env.example .env.local   # fill in your Supabase project URL + anon key
   npm install
   npm run dev
   ```
   Deploy it the same way as `front-door` or `velorah` — any static host
   (Netlify, Vercel) works, since it's a plain Vite build.
7. **Wire up the public site.** In `front-door/index.html`, find
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the top of the `<script>`
   block and fill in the same project's values. Until this is done, "Ask to
   view this" submissions still work for the visitor but don't reach anyone
   — the browser console says so clearly if you check.

## How an enquiry moves through the system

1. A tenant fills in "Ask to view this" on the public site → a row lands in
   `enquiries` with status `new`.
2. A provider logs in here, sees it under **Needs a decision**, and either:
   - **Approves** it — the Edge Function builds a personalised Jotform
     link, emails and texts it to the tenant, and marks the enquiry
     `approved`.
   - **Declines** it — no message goes to the tenant; this can be done
     directly from the dashboard.
3. The tenant fills in the eligibility form in their own time.

There's deliberately no way to approve an enquiry except through the Edge
Function — see the database policy comments for why.
