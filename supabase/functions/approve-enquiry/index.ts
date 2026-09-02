// Supabase Edge Function: approve-enquiry
//
// Called by the provider dashboard when a provider clicks "Approve" on an
// enquiry. This is the ONLY place the Jotform, Resend and Twilio secrets are
// ever read — the browser never sees them. It:
//
//   1. Checks the caller is a logged-in provider who owns the property.
//   2. Builds a prefilled Jotform link for that specific tenant.
//   3. Emails and/or texts the tenant that link.
//   4. Marks the enquiry as approved and logs what was sent.
//
// Deploy with: supabase functions deploy approve-enquiry
// Required secrets (supabase secrets set KEY=value):
//   JOTFORM_FORM_ID       — the eligibility check form's ID from its Jotform URL
//   JOTFORM_API_KEY       — optional; only needed if you upgrade from prefill
//                           links to Jotform's createFormPrefillSubmission API
//   RESEND_API_KEY        — resend.com
//   TWILIO_ACCOUNT_SID    — twilio.com
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER    — a UK-capable Twilio number, e.g. +44...
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase

import { createClient } from "npm:@supabase/supabase-js@2";

interface ApprovePayload {
  enquiry_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client scoped to the calling provider's own JWT, purely to verify who they are.
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Not signed in" }, 401);
  }

  let payload: ApprovePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }
  if (!payload.enquiry_id) {
    return json({ error: "enquiry_id is required" }, 400);
  }

  // Service-role client: bypasses RLS, but only after we've confirmed above that
  // the caller is a real logged-in provider, and only after we confirm below
  // that they own the property this enquiry belongs to.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: enquiry, error: enquiryError } = await admin
    .from("enquiries")
    .select("id, tenant_name, tenant_phone, tenant_email, status, property_id, properties(provider_id, title)")
    .eq("id", payload.enquiry_id)
    .single();

  if (enquiryError || !enquiry) {
    return json({ error: "Enquiry not found" }, 404);
  }
  const property = enquiry.properties as unknown as { provider_id: string; title: string };
  if (property.provider_id !== userData.user.id) {
    return json({ error: "That enquiry isn't on one of your properties" }, 403);
  }
  if (enquiry.status !== "new") {
    return json({ error: `Already ${enquiry.status}` }, 409);
  }

  const jotformUrl = buildJotformPrefillUrl({
    formId: Deno.env.get("JOTFORM_FORM_ID")!,
    name: enquiry.tenant_name,
    phone: enquiry.tenant_phone,
    email: enquiry.tenant_email ?? undefined,
    propertyTitle: property.title,
  });

  const results: string[] = [];
  const errors: string[] = [];

  if (enquiry.tenant_email) {
    try {
      await sendEligibilityEmail(enquiry.tenant_name, enquiry.tenant_email, property.title, jotformUrl);
      results.push("email");
    } catch (e) {
      errors.push(`email: ${(e as Error).message}`);
    }
  }
  try {
    await sendEligibilitySms(enquiry.tenant_name, enquiry.tenant_phone, jotformUrl);
    results.push("sms");
  } catch (e) {
    errors.push(`sms: ${(e as Error).message}`);
  }

  if (results.length === 0) {
    return json({ error: "Could not reach the tenant by any channel", details: errors }, 502);
  }

  const { error: updateError } = await admin
    .from("enquiries")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: userData.user.id })
    .eq("id", enquiry.id);
  if (updateError) {
    return json({ error: "Sent, but failed to update the enquiry status", details: updateError.message }, 500);
  }

  await admin.from("eligibility_sends").insert({
    enquiry_id: enquiry.id,
    jotform_url: jotformUrl,
    channel: results.join("+"),
  });

  return json({ ok: true, sent_via: results, warnings: errors });
});

function buildJotformPrefillUrl(opts: {
  formId: string;
  name: string;
  phone: string;
  email?: string;
  propertyTitle: string;
}): string {
  // Jotform prefills a field by its "unique name" (visible in the form builder
  // under each field's Advanced settings) as a query parameter. Update these
  // three keys — name3, phone4 etc. below are placeholders — to match your
  // actual eligibility form's field unique names before going live.
  const params = new URLSearchParams({
    name3: opts.name,
    phone4: opts.phone,
    property6: opts.propertyTitle,
  });
  if (opts.email) params.set("email5", opts.email);
  return `https://form.jotform.com/${opts.formId}?${params.toString()}`;
}

async function sendEligibilityEmail(name: string, email: string, propertyTitle: string, jotformUrl: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Front Door <hello@frontdoor.example>",
      to: email,
      subject: `Next step for ${propertyTitle}`,
      html: `<p>Hi ${escapeHtml(name)},</p>
        <p>Good news — the landlord for <strong>${escapeHtml(propertyTitle)}</strong> would like to take things
        further. The next step is a short eligibility check, about five minutes:</p>
        <p><a href="${jotformUrl}">${jotformUrl}</a></p>
        <p>If you'd rather do this over the phone, call us on 020 7946 0000.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}

async function sendEligibilitySms(name: string, phone: string, jotformUrl: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const from = Deno.env.get("TWILIO_FROM_NUMBER")!;
  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `Front Door: good news, the landlord wants to move forward. Fill in this short form to continue: ${jotformUrl}`,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Twilio returned ${res.status}: ${await res.text()}`);
}

function escapeHtml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
