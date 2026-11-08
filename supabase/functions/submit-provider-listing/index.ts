// Supabase Edge Function: submit-provider-listing
//
// Called by the public Front Door site's "List your property" form. Public
// (no login) - a landlord/provider fills this in before they ever touch the
// portal. Saves a pending lead for the operator to review; does not create
// or publish a property itself.
//
// Deploy with JWT verification turned OFF.
// Required secrets: RESEND_API_KEY, plus SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, which Supabase sets automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

interface ProviderSubmissionPayload {
  phone: string;
  rooms_count?: number | null;
  postcode?: string | null;
  features?: string[] | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_FEATURES = new Set([
  "parking", "pets_allowed", "garden", "step_free_access",
  "furnished", "wifi_included", "washing_machine", "bike_storage", "communal_area",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let payload: ProviderSubmissionPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  const phone = (payload.phone ?? "").trim();
  const postcode = (payload.postcode ?? "").trim();
  const roomsCount = Number.isFinite(payload.rooms_count)
    ? Math.max(1, Math.min(20, payload.rooms_count as number))
    : null;
  const features = Array.isArray(payload.features)
    ? payload.features.filter((f) => KNOWN_FEATURES.has(f))
    : [];

  if (phone.length < 9 || phone.length > 20) return json({ error: "That phone number doesn't look right" }, 400);
  if (postcode.length > 20) return json({ error: "That postcode doesn't look right" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { error: insertError } = await admin.from("provider_submissions").insert({
    phone,
    rooms_count: roomsCount,
    postcode: postcode || null,
    features,
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
        subject: `New provider lead: ${phone}`,
        html: `<p>A landlord asked to list a property.</p>
          <ul>
            <li>Phone: ${escapeHtml(phone)}</li>
            <li>Rooms: ${roomsCount ?? "not given"}</li>
            <li>Postcode: ${escapeHtml(postcode || "not given")}</li>
            <li>Features: ${features.length ? escapeHtml(features.join(", ")) : "none ticked"}</li>
          </ul>`,
      });
    }
  } catch {
    // Best-effort only — the submission itself is already saved.
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
