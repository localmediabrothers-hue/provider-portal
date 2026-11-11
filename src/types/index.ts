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

export type HousingModel = "transitional" | "supported";

export const HOUSING_MODELS: { value: HousingModel; label: string; benefitsNote: string }[] = [
  { value: "transitional", label: "Transitional accommodation", benefitsNote: "Two benefits needed" },
  { value: "supported", label: "Supported housing", benefitsNote: "One benefit needed" },
];

export const PROPERTY_FEATURES: { value: string; label: string }[] = [
  { value: "parking", label: "Free parking" },
  { value: "pets_allowed", label: "Pets allowed" },
  { value: "garden", label: "Garden" },
  { value: "step_free_access", label: "Step-free access" },
  { value: "bike_storage", label: "Bike storage" },
  { value: "smokers_allowed", label: "Smokers allowed" },
  { value: "female_only", label: "Female only house" },
  { value: "male_only", label: "Male only house" },
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
  housing_model: HousingModel;
  title: string;
  address: string;
  area: string;
  weekly_service_charge: number;
  monthly_rent: number | null;
  blurb: string;
  active: boolean;
  photo_urls: string[];
  photo_labels: string[];
  bedrooms: number | null;
  toilets: number | null;
  floors: number | null;
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

export type ProviderSubmissionStatus = "pending" | "contacted" | "approved" | "declined";

export interface ProviderSubmission {
  id: string;
  phone: string;
  rooms_count: number | null;
  postcode: string | null;
  features: string[];
  status: ProviderSubmissionStatus;
  operator_note: string;
  property_id: string | null;
  created_at: string;
}
