// Supabase Edge Function: track-event
//
// First-party, cookie-free analytics for the public Front Door site - no
// third-party script, nothing leaves this Supabase project. Called with a
// small POST body naming what happened (page_view, property_view,
// enquiry_submitted, provider_listing_submitted, map_search) plus a little
// non-identifying context. Written with the service-role key since there's
// no anonymous insert policy on analytics_events at all - this function is
// the only way in.
//
// Deploy with JWT verification turned OFF.
// Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase sets
// automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_EVENTS = new Set([
  "page_view",
  "property_view",
  "enquiry_submitted",
  "provider_listing_submitted",
  "map_search",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  const eventType = String(body.event_type ?? "");
  if (!KNOWN_EVENTS.has(eventType)) {
    return json({ error: "Unknown event type" }, 400);
  }

  // Trimmed down to plain strings/numbers only, nothing that could carry
  // PII in by accident - no phone/email field is ever read here, and
  // callers on the public site never send one.
  const rawMeta = (body.meta && typeof body.meta === "object") ? body.meta as Record<string, unknown> : {};
  const meta: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(rawMeta)) {
    if (typeof v === "string") meta[k] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) meta[k] = v;
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("analytics_events").insert({ event_type: eventType, meta });
  if (error) {
    // Analytics failing is never worth a 500 that might show up as a
    // visible error to a visitor - log it and say ok anyway.
    console.error("[track-event] Insert failed:", error.message);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
