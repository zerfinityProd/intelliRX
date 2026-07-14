// src/app/repositories/interfaces/config.repository.ts
import {
  SystemSettings,
  SubscriptionConfig,
  ClinicConfig,
  DoctorConfig,
} from '../../config/userSettings';
import { SystemConfig } from '../../models/subscription.model';

/**
 * Abstract token for configuration document data access.
 * All paths under `configurations/` are managed here.
 */
export abstract class ConfigRepository {
  // ── Subscription-level ────────────────────────────────────

  abstract getSubscriptionConfig(
    subscriptionId: string
  ): Promise<SubscriptionConfig | null>;

  abstract setSubscriptionConfig(
    subscriptionId: string,
    config: SubscriptionConfig
  ): Promise<void>;

  // ── Clinic-level ─────────────────────────────────────────

  abstract getClinicConfig(
    clinicId: string,
    subscriptionId: string
  ): Promise<ClinicConfig | null>;

  abstract setClinicConfig(
    clinicId: string,
    config: ClinicConfig,
    subscriptionId: string
  ): Promise<void>;

  // ── Doctor-level ──────────────────────────────────────────

  abstract getDoctorConfig(
    userId: string,
    subscriptionId: string,
    clinicId: string
  ): Promise<DoctorConfig | null>;

  abstract setDoctorConfig(
    userId: string,
    config: DoctorConfig,
    subscriptionId: string,
    clinicId: string
  ): Promise<void>;

  // ── System config ─────────────────────────────────────────

  abstract getSystemConfig(): Promise<SystemConfig>;

  abstract getPlanValidityDays(planKey: string): Promise<number>;
}
