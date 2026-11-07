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
  last_confirmed_at: string;
  max_stay_note: string;
  created_at: string;
}

export interface Enquiry {
  id: string;
  property_id: string;
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
}
