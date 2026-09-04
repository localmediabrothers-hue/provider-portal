// Supabase Edge Function: submit-waitlist
//
// Called by the public Front Door site when nothing currently available
// matches what someone needs — "let me know when something comes up" instead
// of that demand just walking away. Public (no login), same shape as
// submit-enquiry: saves the signup, then emails the provider as a courtesy.
//
// Deploy with JWT verification turned OFF.
// Required secrets: RESEND_API_KEY, plus SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, which Supabase sets automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

interface WaitlistPayload {
  name: string;
  phone: string;
  email?: string | null;
  area?: string | null;
  bedrooms_needed?: number | null;
  note?: string | null;
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

  let payload: WaitlistPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  const name = (payload.name ?? "").trim();
  const phone = (payload.phone ?? "").trim();
  const email = (payload.email ?? "").trim();
  const area = (payload.area ?? "").trim();
  const note = (payload.note ?? "").trim();
  const bedrooms = Number.isFinite(payload.bedrooms_needed) ? Math.max(0, Math.min(10, payload.bedrooms_needed as number)) : null;

  if (name.length < 2 || name.length > 120) return json({ error: "Please give a name" }, 400);
  if (phone.length < 9 || phone.length > 20) return json({ error: "That phone number doesn't look right" }, 400);
  if (email && (!email.includes("@") || email.length > 200)) {
    return json({ error: "That email doesn't look right" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { error: insertError } = await admin.from("waitlist_signups").insert({
    name,
    phone,
    email: email || null,
    area: area || null,
    bedrooms_needed: bedrooms,
    note: note || null,
  });
  if (insertError) {
    return json({ error: "Couldn't save that", details: insertError.message }, 500);
  }

  // Saved either way — the email is a courtesy notification, not the record.
  try {
    const { data: provider } = await admin.from("providers").select("contact_email").limit(1).single();
    if (provider?.contact_email) {
      await sendEmail({
        to: provider.contact_email,
        subject: `Waiting list: ${name}`,
        html: `<p><strong>${escapeHtml(name)}</strong> asked to be told when something comes up.</p>
          <ul>
            <li>Phone: ${escapeHtml(phone)}</li>
            <li>Email: ${escapeHtml(email || "not given")}</li>
            <li>Area: ${escapeHtml(area || "not given")}</li>
            <li>Bedrooms needed: ${bedrooms ?? "not given"}</li>
            <li>Note: ${escapeHtml(note || "none")}</li>
          </ul>`,
      });
    }
  } catch {
    // Best-effort only — the signup itself is already saved.
  }

  return json({ ok: true });
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
