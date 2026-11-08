// Supabase Edge Function: submit-provider-listing
//
// Called by the public Front Door site's "List your property" form. Public
// (no login) - a landlord/provider fills this in before they ever touch the
// portal. As well as saving the lead, this creates a real property and
// rooms for the operator to review and finish - not just raw answers to
// retype by hand.
//
// The property is inserted with active = false explicitly: properties.active
// defaults to TRUE at the database level, so leaving it out here would
// publish a half-finished listing (no real address, no real price) the
// instant someone submits the form. Rooms are created available = false for
// the same reason - even if the operator later flips the property active
// before finishing it, nothing with a placeholder price can be asked about.
//
// Sent as multipart/form-data (not JSON) so it can carry photo files
// alongside the text fields. Photos are uploaded here, with the service-role
// key, rather than the browser uploading straight to Storage - there's no
// anonymous-upload policy on the property-photos bucket, and there's no
// need for one: this function is the only thing that ever needs to write
// into it on a provider's behalf.
//
// Deploy with JWT verification turned OFF.
// Required secrets: RESEND_API_KEY, plus SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, which Supabase sets automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_FEATURES = new Set([
  "parking", "pets_allowed", "garden", "step_free_access",
  "furnished", "wifi_included", "washing_machine", "bike_storage", "communal_area",
]);

// A room needs *some* weekly_service_charge (not null, no default) before
// it exists at all - this is a clearly-a-placeholder value the operator
// has to notice and replace, not a real price. Paired with available:false
// so it can never actually be asked about even if they miss it.
const PLACEHOLDER_ROOM_PRICE = 0;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }

  const phone = String(form.get("phone") ?? "").trim();
  const postcode = String(form.get("postcode") ?? "").trim();
  const roomsCountRaw = Number(form.get("rooms_count"));
  const roomsCount = Number.isFinite(roomsCountRaw) ? Math.max(1, Math.min(20, roomsCountRaw)) : null;
  let featuresRaw: unknown = [];
  try {
    featuresRaw = JSON.parse(String(form.get("features") ?? "[]"));
  } catch {
    featuresRaw = [];
  }
  const features = Array.isArray(featuresRaw) ? featuresRaw.filter((f) => KNOWN_FEATURES.has(f)) : [];
  const photos = form.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);

  if (phone.length < 9 || phone.length > 20) return json({ error: "That phone number doesn't look right" }, 400);
  if (postcode.length > 20) return json({ error: "That postcode doesn't look right" }, 400);
  if (photos.length > 12) return json({ error: "That's too many photos — 12 at most" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Photos are a nice-to-have, not a reason to fail the whole submission -
  // if one fails to upload, carry on without it rather than losing the
  // lead the provider just spent time filling in.
  const photoUrls: string[] = [];
  for (const photo of photos) {
    try {
      const ext = (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `pending/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("property-photos")
        .upload(path, photo, { contentType: photo.type || "image/jpeg" });
      if (uploadError) {
        console.error("[submit-provider-listing] Photo upload failed:", uploadError.message);
        continue;
      }
      const { data } = admin.storage.from("property-photos").getPublicUrl(path);
      photoUrls.push(data.publicUrl);
    } catch (e) {
      console.error("[submit-provider-listing] Photo upload threw:", e);
    }
  }

  // There's exactly one provider (operator) on this site - every property
  // needs a provider_id, so this is the one to use.
  const { data: provider, error: providerError } = await admin.from("providers").select("id, contact_email").limit(1).single();
  if (providerError || !provider) {
    return json({ error: "Couldn't find a provider account to attach this to" }, 500);
  }

  let propertyId: string | null = null;
  try {
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .insert({
        slug: crypto.randomUUID(),
        provider_id: provider.id,
        title: `New listing${postcode ? ` — ${postcode}` : ""} (needs review)`,
        address: postcode || "Address not yet given",
        area: postcode || "",
        features,
        photo_urls: photoUrls,
        blurb: "Submitted by a landlord through the website — not yet reviewed.",
        active: false, // see the big comment at the top of this file
      })
      .select("id")
      .single();
    if (propertyError) throw propertyError;
    propertyId = property.id;

    const roomsToInsert = Array.from({ length: roomsCount ?? 1 }, (_, i) => ({
      property_id: propertyId,
      weekly_service_charge: PLACEHOLDER_ROOM_PRICE,
      available: false, // see the big comment at the top of this file
      sort_order: i,
    }));
    const { error: roomsError } = await admin.from("rooms").insert(roomsToInsert);
    if (roomsError) throw roomsError;
  } catch (e) {
    // The lead itself is still worth saving even if the draft property
    // couldn't be built - log it and fall through to saving the lead.
    console.error("[submit-provider-listing] Draft property/rooms creation failed:", e);
  }

  const { error: insertError } = await admin.from("provider_submissions").insert({
    phone,
    rooms_count: roomsCount,
    postcode: postcode || null,
    features,
    property_id: propertyId,
  });
  if (insertError) {
    return json({ error: "Couldn't save that", details: insertError.message }, 500);
  }

  // Saved either way — the email is a courtesy notification, not the record.
  try {
    if (provider.contact_email) {
      await sendEmail({
        to: provider.contact_email,
        subject: `New provider lead: ${phone}`,
        html: `<p>A landlord asked to list a property${propertyId ? " — a draft listing has been created, inactive, ready for you to finish and approve under Properties." : " (the draft listing couldn't be auto-created this time — check the Provider leads tab)."}</p>
          <ul>
            <li>Phone: ${escapeHtml(phone)}</li>
            <li>Rooms: ${roomsCount ?? "not given"}</li>
            <li>Postcode: ${escapeHtml(postcode || "not given")}</li>
            <li>Features: ${features.length ? escapeHtml(features.join(", ")) : "none ticked"}</li>
            <li>Photos: ${photoUrls.length}</li>
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
