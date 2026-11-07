import type { Property, WaitlistSignup } from "@/types";

/* A property "matches" a waiting-list entry the same way the public site's
   own search does: the area is matched by whole word, and bedrooms_needed
   of 4 means "4 or more" - same convention as the site's own size filter. */
export function matchesWaitlist(signup: WaitlistSignup, property: Property): boolean {
  if (signup.area) {
    const want = signup.area.trim().toLowerCase();
    const words = [property.area, property.address, property.title]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (want && !words.some((w) => w.startsWith(want))) return false;
  }
  if (signup.bedrooms_needed != null) {
    if (signup.bedrooms_needed >= 4) {
      if (!property.bedrooms || property.bedrooms < 4) return false;
    } else if (property.bedrooms !== signup.bedrooms_needed) {
      return false;
    }
  }
  return true;
}
