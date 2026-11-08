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
// publish a half-finished listing (no real address) the instant someone
// submits the form. Rooms are created from what the provider actually said
// - type, ensuite, size, price, whether it's available - since the form
// now asks for a real weekly price per room rather than leaving that for
// the operator to fill in later. The property itself still needs a real
// address and a once-over before it's worth activating, which is what
// active:false is for.
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
  "bike_storage", "smokers_allowed", "female_only", "male_only",
]);

// The public form only ever offers house/flat/studio - "room" stays a
// valid property type in the database (the operator's own Properties page
// still uses it for a single-room listing), just not one a provider
// submission can produce.
const KNOWN_PROPERTY_TYPES = new Set(["flat", "house", "studio"]);
const KNOWN_ROOM_TYPES = new Set(["single", "double"]);

// A room needs *some* weekly_service_charge (not null, no default) - this
// is the fallback only when a provider's answer is missing or nonsense
// (blank, negative, absurdly large), not the normal case now that the form
// actually asks for a price.
const FALLBACK_ROOM_PRICE = 0;
const MAX_ROOM_PRICE = 500;

interface RoomAnswer {
  available: boolean;
  size_sqm: number | null;
  ensuite: boolean;
  room_type: "single" | "double";
  weekly_service_charge: number;
}

function parseRoomAnswers(raw: string, roomsCount: number): RoomAnswer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) parsed = [];
  const rooms = (parsed as unknown[]).slice(0, roomsCount).map((r) => {
    const room = (r ?? {}) as Record<string, unknown>;
    const sizeRaw = Number(room.size_sqm);
    const priceRaw = Number(room.weekly_service_charge);
    return {
      available: room.available !== false,
      size_sqm: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : null,
      ensuite: room.ensuite === true,
      room_type: KNOWN_ROOM_TYPES.has(room.room_type as string) ? (room.room_type as "single" | "double") : "double",
      weekly_service_charge: Number.isFinite(priceRaw) && priceRaw > 0 ? Math.min(priceRaw, MAX_ROOM_PRICE) : FALLBACK_ROOM_PRICE,
    };
  });
  // Pad out with sensible defaults if fewer room answers came through than
  // rooms_count said - a provider's browser issue shouldn't lose rooms.
  while (rooms.length < roomsCount) {
    rooms.push({ available: true, size_sqm: null, ensuite: false, room_type: "double", weekly_service_charge: FALLBACK_ROOM_PRICE });
  }
  return rooms;
}

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
  const streetAddress = String(form.get("street_address") ?? "").trim();
  const roomsCountRaw = Number(form.get("rooms_count"));
  // The public form only ever offers 1-6 as a dropdown, but this is the
  // one place that actually enforces it.
  const roomsCount = Number.isFinite(roomsCountRaw) ? Math.max(1, Math.min(6, roomsCountRaw)) : 1;
  const propertyType = KNOWN_PROPERTY_TYPES.has(String(form.get("property_type"))) ? String(form.get("property_type")) : "flat";
  const toiletsRaw = Number(form.get("toilets"));
  const toilets = Number.isFinite(toiletsRaw) && toiletsRaw >= 0 ? Math.min(20, toiletsRaw) : null;
  const floorsRaw = Number(form.get("floors"));
  const floors = Number.isFinite(floorsRaw) && floorsRaw >= 0 ? Math.min(20, floorsRaw) : null;
  let featuresRaw: unknown = [];
  try {
    featuresRaw = JSON.parse(String(form.get("features") ?? "[]"));
  } catch {
    featuresRaw = [];
  }
  const features = Array.isArray(featuresRaw) ? featuresRaw.filter((f) => KNOWN_FEATURES.has(f)) : [];
  const roomAnswers = parseRoomAnswers(String(form.get("rooms") ?? "[]"), roomsCount);
  const photos = form.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);
  let photoLabelsRaw: unknown = [];
  try {
    photoLabelsRaw = JSON.parse(String(form.get("photo_labels") ?? "[]"));
  } catch {
    photoLabelsRaw = [];
  }
  const photoLabelsIn = Array.isArray(photoLabelsRaw) ? photoLabelsRaw.map((l) => String(l ?? "").slice(0, 60)) : [];

  if (phone.length < 9 || phone.length > 20) return json({ error: "That phone number doesn't look right" }, 400);
  if (postcode.length > 20) return json({ error: "That postcode doesn't look right" }, 400);
  if (photos.length > 12) return json({ error: "That's too many photos — 12 at most" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Photos are a nice-to-have, not a reason to fail the whole submission -
  // if one fails to upload, carry on without it rather than losing the
  // lead the provider just spent time filling in. photoLabels is built in
  // step with photoUrls (not photos) so a failed upload doesn't shift every
  // later label out of position.
  const photoUrls: string[] = [];
  const photoLabels: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
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
      photoLabels.push(photoLabelsIn[i] ?? "");
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
        address: streetAddress ? `${streetAddress}, ${postcode}` : (postcode || "Address not yet given"),
        area: postcode || "",
        type: propertyType,
        toilets,
        floors,
        features,
        photo_urls: photoUrls,
        photo_labels: photoLabels,
        blurb: "Submitted by a landlord through the website — not yet reviewed.",
        active: false, // see the big comment at the top of this file
      })
      .select("id")
      .single();
    if (propertyError) throw propertyError;
    propertyId = property.id;

    // Taken straight from what the provider said for each room - the
    // property itself still needs a real address and a once-over before
    // it's worth switching on, but there's no reason to second-guess a
    // provider's own room-by-room answers the way an auto-generated
    // placeholder price would have needed.
    const roomsToInsert = roomAnswers.map((r, i) => ({
      property_id: propertyId,
      room_type: r.room_type,
      ensuite: r.ensuite,
      size_sqm: r.size_sqm,
      weekly_service_charge: r.weekly_service_charge,
      available: r.available,
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
