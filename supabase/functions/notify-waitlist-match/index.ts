// Supabase Edge Function: notify-waitlist-match
//
// Called by the Properties page right after a property is saved/activated
// with at least one available room, if that match check finds people
// already on the waiting list for something like it. The portal already
// shows an in-page banner for this - this is the same alert, but as an
// email, so it still reaches the operator even if they've already
// navigated away from the Properties page by the time they'd notice it.
//
// Deploy with: supabase functions deploy notify-waitlist-match
// (JWT verification stays ON - default - since only the logged-in
// operator should ever be able to trigger this email.)
// Required secrets: RESEND_API_KEY, plus SUPABASE_URL, SUPABASE_ANON_KEY
// and SUPABASE_SERVICE_ROLE_KEY, which Supabase sets automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

interface NotifyPayload {
  property_title: string;
  area: string;
  match_count: number;
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

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Confirms a real logged-in operator is calling this, not just anyone who
  // found the URL - the email itself costs nothing to send, but there's no
  // reason to let an outsider trigger it.
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Not signed in" }, 401);
  }

  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  const title = (payload.property_title ?? "").trim();
  const area = (payload.area ?? "").trim();
  const count = Number.isFinite(payload.match_count) ? Math.max(0, payload.match_count) : 0;
  if (!title || count < 1) {
    return json({ error: "Nothing to notify about" }, 400);
  }

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Best-effort only, same as every other notification email in this
  // project - if it fails to send, the in-portal banner the operator just
  // saw is still the record of the match, not this email.
  try {
    const { data: provider } = await admin.from("providers").select("contact_email").limit(1).single();
    if (provider?.contact_email) {
      await sendEmail({
        to: provider.contact_email,
        subject: `${count} waiting-list match${count === 1 ? "" : "es"} for "${title}"`,
        html: `<p><strong>${count}</strong> ${count === 1 ? "person" : "people"} on your waiting list ${count === 1 ? "is" : "are"} looking for something like <strong>${escapeHtml(title)}</strong>${area ? ` in ${escapeHtml(area)}` : ""}.</p>
          <p>Open the Waiting list tab in the portal to message them.</p>`,
      });
    }
  } catch {
    // swallow - the signup/property save already succeeded regardless
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
    body: JSON.stringify({ from: "My Room Link <onboarding@resend.dev>", to, subject, html }),
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
