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

/** Billing cycle options available for plan selection */
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

export interface Subscription {
  id?: string;
  entity_name: string;          // e.g. "City Health Group"
  owner_email: string;          // email of the subscription owner/admin
  billing_email?: string;       // billing contact (defaults to owner_email)
  plan?: SubscriptionPlan;      // may be absent in legacy/incomplete Firestore docs
  status: 'active' | 'inactive' | 'suspended';
  /** ISO date string — subscription blocks login after this date (e.g. "2026-08-01T00:00:00.000Z") */
  valid_until?: string;
  /** Billing cycle selected when the plan was last changed */
  billing_cycle?: BillingCycle;
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

/**
 * Full plan details fetched from the Firestore `plans` collection.
 * Monthly/quarterly/yearly prices represent the per-month equivalent charge.
 */
export interface PlanDetail {
  key: string;                  // Firestore document ID, e.g. "starter"
  label: string;                // Display name, e.g. "Starter"
  description?: string;         // Optional tagline
  monthly_charges: number;      // Price billed monthly
  quarterly_charges: number;    // Per-month equivalent when billed quarterly
  yearly_charges: number;       // Per-month equivalent when billed yearly
  max_clinics: number;
  max_doctors: number;
  max_receptionists: number;
  max_patients: number;
  validity_days: number;        // Plan's validity in days (from plans doc or system config)
  features?: string[];          // Optional extra feature strings
  /**
   * Number of days before the plan expiry date when the subscription-expiring
   * in-app notification should start appearing.
   * Absent for demo plans — demo users see the notification every day.
   */
  plan_ending_nf?: number;
}

