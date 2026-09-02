// Supabase Edge Function: submit-enquiry
//
// Called by the public Front Door site when a tenant fills in "Ask to view
// this". It replaces the site's old direct database insert so that two emails
// can go out at the moment the enquiry lands — which needs the Resend key, and
// that must never be in the public site's code.
//
//   1. Saves the enquiry.
//   2. Emails the provider so they know someone's waiting on them.
//   3. Emails the tenant to confirm it arrived and say what happens next.
//
// This one is deliberately public (no login) — deploy it with JWT verification
// turned OFF, since the people using it are tenants who have no account.
// Required secrets: RESEND_API_KEY, plus SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, which Supabase sets automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

interface EnquiryPayload {
  property_id: string;
  tenant_name: string;
  tenant_phone: string;
  tenant_email?: string | null;
  best_time?: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let payload: EnquiryPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  // This endpoint is open to the public, so check the input rather than
  // trusting it — the site validates too, but that's only a courtesy to the
  // person filling it in, not a control.
  const name = (payload.tenant_name ?? "").trim();
  const phone = (payload.tenant_phone ?? "").trim();
  const email = (payload.tenant_email ?? "").trim();
  const bestTime = (payload.best_time ?? "").trim();
  if (!payload.property_id) return json({ error: "property_id is required" }, 400);
  if (name.length < 2 || name.length > 120) return json({ error: "Please give a name" }, 400);
  if (phone.length < 9 || phone.length > 20) return json({ error: "That phone number doesn't look right" }, 400);
  if (email && (!email.includes("@") || email.length > 200)) {
    return json({ error: "That email doesn't look right" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Only accept enquiries against a property that's actually listed.
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id, title, address, active, providers(name, contact_email)")
    .eq("id", payload.property_id)
    .single();

  if (propertyError || !property || !property.active) {
    return json({ error: "That property isn't available" }, 404);
  }
  const provider = property.providers as unknown as { name: string; contact_email: string };

  const { error: insertError } = await admin.from("enquiries").insert({
    property_id: property.id,
    tenant_name: name,
    tenant_phone: phone,
    tenant_email: email || null,
    best_time: bestTime || null,
  });
  if (insertError) {
    return json({ error: "Couldn't save that enquiry", details: insertError.message }, 500);
  }

  // The enquiry is safely saved by this point. The emails are a courtesy on
  // top — if one fails we still report success, because making the tenant
  // re-submit would create a duplicate rather than fix anything.
  const warnings: string[] = [];

  try {
    await sendEmail({
      to: provider.contact_email,
      subject: `New enquiry: ${property.title}`,
      html: `<p>Hi ${escapeHtml(provider.name)},</p>
        <p><strong>${escapeHtml(name)}</strong> has asked to view
        <strong>${escapeHtml(property.title)}</strong> on ${escapeHtml(property.address)}.</p>
        <ul>
          <li>Phone: ${escapeHtml(phone)}</li>
          <li>Email: ${escapeHtml(email || "not given")}</li>
          <li>Best time to call: ${escapeHtml(bestTime || "any time")}</li>
        </ul>
        <p>Sign in to the provider portal to approve them and send the eligibility check,
        or to decline.</p>`,
    });
  } catch (e) {
    warnings.push(`provider email: ${(e as Error).message}`);
  }

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `We've got your enquiry — ${property.title}`,
        html: `<p>Hi ${escapeHtml(name)},</p>
          <p>Thanks — your enquiry about <strong>${escapeHtml(property.title)}</strong> on
          ${escapeHtml(property.address)} is with the landlord now. Here's what happens next:</p>
          <ol>
            <li>The landlord looks at your enquiry and gets in touch.</li>
            <li>If they'd like to go further, we'll send you a short eligibility check —
                about five minutes.</li>
            <li>Once that clears, we book you in for a viewing.</li>
            <li>If it's right for you, we arrange the rent straight from your Housing Benefit
                or Universal Credit, so you only ever pay the weekly service charge.</li>
          </ol>
          <p>Nothing to pay at any point in that process, and there's no deposit.</p>
          <p>If you'd rather talk to someone, call us on 020 7946 0000.</p>`,
      });
    } catch (e) {
      warnings.push(`tenant email: ${(e as Error).message}`);
    }
  }

  return json({ ok: true, warnings });
});

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "Front Door <onboarding@resend.dev>", to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}

function escapeHtml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
