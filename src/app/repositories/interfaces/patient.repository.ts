// src/app/repositories/interfaces/patient.repository.ts
import { Patient, Visit } from '../../models/patient.model';

export interface PagedResult {
  results: Patient[];
  /** Opaque cursor for the next page */
  lastCursor: any;
  hasMore: boolean;
}

/**
 * Abstract token for patient + visit data access.
 * Inject this — NOT FirebasePatientRepository — in services and components.
 *
 * To swap database backends, change the useClass in app.config.ts.
 */
export abstract class PatientRepository {
  abstract addPatient(
    patientData: Omit<Patient, 'id' | 'last_updated'>
  ): Promise<string>;

  abstract getPatientById(patientId: string): Promise<Patient | null>;

  abstract searchPatientByPhone(
    phone: string,
    lastCursor?: any,
    clinicId?: string
  ): Promise<PagedResult>;

  abstract searchPatientByName(
    name: string,
    lastCursor?: any,
    clinicId?: string
  ): Promise<PagedResult>;

  abstract searchPatientsContaining(
    term: string,
    clinicId?: string
  ): Promise<PagedResult>;

  abstract updatePatient(
    patientId: string,
    patientData: Partial<Patient>
  ): Promise<void>;

  abstract deletePatient(patientId: string): Promise<void>;

  abstract getPatientCount(
    subscriptionId: string,
    clinicId?: string | null
  ): Promise<number>;

  // ── Visits ──────────────────────────────────────────────────

  abstract getPatientVisits(patientId: string, clinicId?: string): Promise<Visit[]>;

  abstract addVisit(
    visitData: Omit<Visit, 'id' | 'created_at'>
  ): Promise<string>;

  abstract updateVisit(visitId: string, visitData: Partial<Visit>): Promise<void>;

  abstract deleteVisit(visitId: string): Promise<void>;

  abstract clearCache(): void;

  abstract readonly PAGE_SIZE: number;
}
