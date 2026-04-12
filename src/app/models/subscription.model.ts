export interface PlanLimits {
  max_clinics: number;
  max_doctors: number;
  max_appointments_per_day: number;
}

export interface SubscriptionPlan {
  name: string;         // e.g. "premium", "basic"
  limits: PlanLimits;
}

export interface Subscription {
  id?: string;
  entity_name: string;          // e.g. "City Health Group"
  owner_email: string;          // email of the subscription owner/admin
  billing_email?: string;       // billing contact (defaults to owner_email)
  plan: SubscriptionPlan;
  status: 'active' | 'inactive' | 'suspended';
  permissions?: Record<string, string[]>;  // role → permission overrides (e.g. { "doctor": ["canEdit","canAddPatient"] })
  created_at?: string;          // ISO datetime
  updated_at?: string;          // ISO datetime
}
