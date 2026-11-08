export type EnquiryStatus =
  | "new"
  | "approved"
  | "form_returned"
  | "eligible"
  | "not_eligible"
  | "viewing_booked"
  | "moved_in"
  | "declined"
  | "withdrawn";

export interface EnquiryNote {
  id: string;
  enquiry_id: string;
  provider_id: string;
  body: string;
  created_at: string;
}

export interface Provider {
  id: string;
  name: string;
  contact_email: string;
  contact_phone: string | null;
}

export type PropertyType = "flat" | "room" | "house" | "studio";

export type RoomType = "single" | "double";

export const PROPERTY_FEATURES: { value: string; label: string }[] = [
  { value: "parking", label: "Free parking" },
  { value: "pets_allowed", label: "Pets allowed" },
  { value: "garden", label: "Garden" },
  { value: "step_free_access", label: "Step-free access" },
  { value: "furnished", label: "Furnished" },
  { value: "wifi_included", label: "Wifi included" },
  { value: "washing_machine", label: "Washing machine" },
  { value: "bike_storage", label: "Bike storage" },
  { value: "communal_area", label: "Communal area" },
];

export interface Room {
  id: string;
  property_id: string;
  label: string;
  room_type: RoomType;
  ensuite: boolean;
  size_sqm: number | null;
  weekly_service_charge: number;
  available: boolean;
  sort_order: number;
  created_at: string;
}

export interface Property {
  id: string;
  slug: string;
  provider_id: string;
  type: PropertyType;
  title: string;
  address: string;
  area: string;
  weekly_service_charge: number;
  monthly_rent: number | null;
  blurb: string;
  active: boolean;
  photo_urls: string[];
  bedrooms: number | null;
  features: string[];
  last_confirmed_at: string;
  max_stay_note: string;
  created_at: string;
}

export interface Enquiry {
  id: string;
  property_id: string;
  room_id: string | null;
  tenant_name: string;
  tenant_phone: string;
  tenant_email: string | null;
  best_time: string | null;
  message: string | null;
  claiming_benefits: boolean | null;
  status: EnquiryStatus;
  created_at: string;
  status_changed_at: string;
  approved_at: string | null;
}

export interface WaitlistSignup {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  area: string | null;
  bedrooms_needed: number | null;
  note: string | null;
  claiming_benefits: boolean | null;
  operator_note: string;
  notified: boolean;
  created_at: string;
}

export interface EnquiryWithProperty extends Enquiry {
  properties: Pick<Property, "id" | "title" | "address">;
  rooms: Pick<Room, "id" | "label" | "room_type" | "ensuite"> | null;
}
