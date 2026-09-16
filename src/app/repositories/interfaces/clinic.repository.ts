// src/app/repositories/interfaces/clinic.repository.ts
import { Clinic, ClinicSchedule } from '../../models/clinic.model';

/**
 * Abstract token for clinic data access.
 */
export abstract class ClinicRepository {
  abstract getClinics(subscriptionId: string): Promise<Clinic[]>;

  abstract getClinicById(clinicId: string): Promise<Clinic | null>;

  /** Returns the clinic's name, or the clinicId as fallback. */
  abstract getClinicName(clinicId: string): Promise<string>;

  /**
   * Returns a minimal object with name and optional address for display.
   * Used by components that need to show user-facing labels without loading
   * a full Clinic model.
   */
  abstract getClinicSummary(
    clinicId: string
  ): Promise<{ name: string; address?: string } | null>;

  abstract createClinic(
    clinicData: Omit<Clinic, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string>;

  abstract updateClinic(clinicId: string, updates: Partial<Clinic>): Promise<void>;

  abstract deleteClinic(clinicId: string): Promise<void>;

  abstract getClinicSchedule(clinicId: string): Promise<ClinicSchedule | null>;

  abstract setClinicSchedule(
    clinicId: string,
    schedule: ClinicSchedule
  ): Promise<void>;

  abstract invalidateCache(): void;

  /**
   * Returns the next globally-unique clinic ID (e.g. "cln_7").
   * Scans all clinic documents to find the current maximum, so IDs
   * are never duplicated across subscriptions.
   */
  abstract getNextClinicId(): Promise<string>;
}
