// src/app/models/config.model.ts
// Re-exports config overlay types and provides a Firestore document wrapper.

export type {
  SubscriptionConfig,
  ClinicConfig,
  DoctorConfig,
} from '../config/userSettings';

export { resolveEffectiveSettings } from '../config/userSettings';

/**
 * Wrapper for a config document stored in Firestore.
 *
 * Firestore paths:
 *   subscriptions/{subscriptionId}/config/settings
 *   clinics/{clinicId}/config/settings
 *   users/{userId}/config/settings
 */
export interface ConfigDocument<T> {
  id?: string;
  data: T;
  updated_at?: string;   // ISO datetime
  updated_by?: string;   // email of the user who last modified
}
