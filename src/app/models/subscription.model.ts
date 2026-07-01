export interface PlanLimits {
  max_clinics: number;
  max_doctors: number;
  max_receptionists: number;
  max_appointments_per_day: number;
}

export interface SubscriptionPlan {
  /** Plan name — fetched dynamically from Firestore configurations/system, e.g. "demo", "starter", "pro" */
  name: string;
  limits: PlanLimits;
}

export interface Subscription {
  id?: string;
  entity_name: string;          // e.g. "City Health Group"
  owner_email: string;          // email of the subscription owner/admin
  billing_email?: string;       // billing contact (defaults to owner_email)
  plan: SubscriptionPlan;
  status: 'active' | 'inactive' | 'suspended';
  /** ISO date string — subscription blocks login after this date (e.g. "2026-08-01T00:00:00.000Z") */
  valid_until?: string;
  permissions?: Record<string, string[]>;  // role → permission overrides
  created_at?: string;          // ISO datetime
  updated_at?: string;          // ISO datetime
}

/** Shape of the configurations/system document */
export interface SystemConfig {
  [key: string]: number | string;
  // e.g. demo_plan_validity_days: 7, starter_plan_validity_days: 31, pro_plan_validity_days: 365
}

/** A single plan entry resolved from SystemConfig */
export interface PlanOption {
  key: string;    // e.g. "demo", "starter", "pro"
  label: string;  // e.g. "Demo", "Starter", "Pro"
  days: number;   // validity days
}

