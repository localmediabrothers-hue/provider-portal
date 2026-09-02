export type EnquiryStatus = "new" | "approved" | "declined" | "form_sent";

export interface Property {
  id: string;
  slug: string;
  provider_id: string;
  title: string;
  address: string;
  weekly_service_charge: number;
  active: boolean;
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
  status: EnquiryStatus;
  created_at: string;
  approved_at: string | null;
}

export interface EnquiryWithProperty extends Enquiry {
  properties: Pick<Property, "id" | "title" | "address">;
}
