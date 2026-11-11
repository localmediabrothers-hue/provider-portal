// Supabase Edge Function: public-stats
//
// A couple of real, live numbers for the public site to show as trust
// signals - "X homes live right now", "Y people housed" - computed
// straight from the database rather than hand-typed into the page, so
// they're never stale or made up. Only ever returns two counts, nothing
// row-level, so it's safe to call with no auth and no secrets at all.
//
// Deploy with JWT verification turned OFF.
// Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase sets
// automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const [propertiesRes, housedRes] = await Promise.all([
    admin.from("properties").select("id", { count: "exact", head: true }).eq("active", true),
    admin.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "moved_in"),
  ]);

  return new Response(JSON.stringify({
    properties_live: propertiesRes.count ?? 0,
    people_housed: housedRes.count ?? 0,
  }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
