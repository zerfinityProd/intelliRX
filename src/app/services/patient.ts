// src/app/services/patient.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PatientRepository } from '../repositories/interfaces/patient.repository';
import { AuthenticationService } from './authenticationService';
import { PatientSearchService } from './patientSearchService';
import { ClinicContextService } from './clinicContextService';
import { ConfigService } from './configService';
import { Patient, Visit } from '../models/patient.model';
import {
  isValidPhone,
  isValidEmail,
  validatePatientData
} from '../utilities/patientValidation';

/**
 * Orchestrates patient operations.
 *
 * Depends on PatientRepository (abstract) — never on a concrete Firebase class.
 * To switch databases, only the provider binding in app.config.ts changes.
 */
@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private readonly selectedPatientSubject = new BehaviorSubject<Patient | null>(null);
  public readonly selectedPatient$ = this.selectedPatientSubject.asObservable();

  get searchResults$(): Observable<Patient[]> {
    return this.searchService.searchResults$;
  }

  get hasMoreResults(): boolean {
    return this.searchService.hasMoreResults;
  }

  get isLoadingMore(): boolean {
    return this.searchService.isLoadingMore;
  }

  constructor(
    private patientRepo: PatientRepository,
    private authService: AuthenticationService,
    private searchService: PatientSearchService,
    private clinicContextService: ClinicContextService,
    private configService: ConfigService
  ) { }

  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    return userId;
  }

  private getClinicId(): string | undefined {
    return this.clinicContextService.getSelectedClinicId() || undefined;
  }

  private async resolveClinicId(): Promise<string | undefined> {
    try {
      const subId = this.clinicContextService.getSubscriptionId();
      if (subId) {
        const subConfig = await this.configService.getSubscriptionConfig(subId);
        if (subConfig?.multiClinic?.share_patients_across_clinics) {
          return undefined;
        }
      }
    } catch { /* fall through to clinic-scoped */ }
    return this.clinicContextService.getSelectedClinicId() || undefined;
  }

  // ──── SEARCH & PAGINATION ────

  async searchPatients(searchTerm: string): Promise<void> {
    await this.searchService.search(searchTerm);
  }

  async loadMorePatients(): Promise<void> {
    await this.searchService.loadMore();
  }

  clearSearchResults(): void {
    this.searchService.clear();
  }

  // ──── CRUD OPERATIONS ────

  async getPatient(patientId: string): Promise<Patient | null> {
    try {
      const patient = await this.patientRepo.getPatientById(patientId);
      if (patient) this.selectedPatientSubject.next(patient);
      return patient;
    } catch (error) {
      console.error('❌ Error fetching patient:', error);
      throw error;
    }
  }

  async createPatient(patientData: Omit<Patient, 'id' | 'last_updated'>): Promise<string> {
    try {
      const existingPatient = await this.findExistingPatient(patientData.name, patientData.phone);
      if (existingPatient) {
        console.debug('[Patient] Found existing patient — updating in place.');
        const updateData: Partial<Patient> = {
          name: patientData.name,
          phone: patientData.phone,
          email: patientData.email || existingPatient.email,
          dob: patientData.dob || existingPatient.dob,
          gender: patientData.gender || existingPatient.gender,
          allergies: patientData.allergies || existingPatient.allergies,
          ailments: patientData.ailments || existingPatient.ailments
        };
        await this.updatePatient(existingPatient.id!, updateData);
        return existingPatient.id!;
      }

      const subId = this.clinicContextService.requireSubscriptionId();
      const clinicId = this.clinicContextService.getSelectedClinicId();
      const clinic_ids = patientData.clinic_ids?.length
        ? patientData.clinic_ids
        : (clinicId ? [clinicId] : []);

      const fullPatientData = {
        ...patientData,
        subscription_id: patientData.subscription_id || subId,
        clinic_ids
      };

      const patientId = await this.patientRepo.addPatient(fullPatientData);
      console.debug('[Patient] New patient record created.');
      return patientId;
    } catch (error) {
      console.error('❌ Error creating patient:', error);
      throw error;
    }
  }

  async updatePatient(patientId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      await this.patientRepo.updatePatient(patientId, patientData);
    } catch (error) {
      console.error('❌ Error updating patient:', error);
      throw error;
    }
  }

  async deletePatient(patientId: string): Promise<void> {
    try {
      await this.patientRepo.deletePatient(patientId);
      this.selectedPatientSubject.next(null);
    } catch (error) {
      console.error('❌ Error deleting patient:', error);
      throw error;
    }
  }

  selectPatient(patient: Patient | null): void {
    this.selectedPatientSubject.next(patient);
  }

  // ──── VISIT MANAGEMENT ────

  async addVisit(patientId: string, visitData: Omit<Visit, 'id' | 'created_at'>): Promise<string> {
    try {
      const visitId = await this.patientRepo.addVisit({ ...visitData, patient_id: patientId });
      return visitId;
    } catch (error) {
      console.error('❌ Error adding visit:', error);
      throw error;
    }
  }

  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      return await this.patientRepo.getPatientVisits(patientId);
    } catch (error) {
      console.error('❌ Error fetching visits:', error);
      return [];
    }
  }

  async updateVisit(patientId: string, visitId: string, visitData: Partial<Visit>): Promise<void> {
    try {
      await this.patientRepo.updateVisit(visitId, visitData);
    } catch (error) {
      console.error('❌ Error updating visit:', error);
      throw error;
    }
  }

  async deleteVisit(patientId: string, visitId: string): Promise<void> {
    try {
      await this.patientRepo.deleteVisit(visitId);
    } catch (error) {
      console.error('❌ Error deleting visit:', error);
      throw error;
    }
  }

  // ──── VALIDATION ────

  isValidPhone(phone: string): boolean { return isValidPhone(phone); }
  isValidEmail(email: string): boolean { return isValidEmail(email); }

  validatePatientData(data: {
    name?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date | string;
    gender?: string;
  }): { valid: boolean; errors: string[] } {
    return validatePatientData(data);
  }

  // ──── PHONE SEARCH (parallel prefix + contains) ────

  async searchPatientsByPhoneNumber(digits: string, clinicId?: string): Promise<Patient[]> {
    const [prefixSettled, containsSettled] = await Promise.allSettled([
      this.patientRepo.searchPatientByPhone(digits, null, clinicId),
      this.patientRepo.searchPatientsContaining(digits, clinicId)
    ]);
    const prefixResults = prefixSettled.status === 'fulfilled' ? prefixSettled.value.results : [];
    const containsResults = containsSettled.status === 'fulfilled' ? containsSettled.value.results : [];

    const seen = new Set<string>();
    const merged: Patient[] = [];
    for (const p of [...prefixResults, ...containsResults]) {
      const key = p.id || p.phone;
      if (!seen.has(key)) { seen.add(key); merged.push(p); }
    }
    return merged;
  }

  // ──── EXISTENCE CHECKS ────

  async findPatientByPhone(phone: string): Promise<Patient | null> {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) return null;
    const clinicId = await this.resolveClinicId();
    try {
      const { results } = await this.patientRepo.searchPatientByPhone(normalizedPhone, null, clinicId);
      const exact = results.filter(p => p.phone.trim() === normalizedPhone);
      if (exact.length > 0) return exact[0];
    } catch { /* fall through */ }
    try {
      const { results } = await this.patientRepo.searchPatientsContaining(normalizedPhone, clinicId);
      const exact = results.filter(p => p.phone.trim() === normalizedPhone);
      if (exact.length > 0) return exact[0];
    } catch { /* fall through */ }
    return null;
  }

  async checkPatientExists(name: string, phone: string): Promise<boolean> {
    try {
      if (!name.trim() || !phone.trim()) return false;
      return !!(await this.findExistingPatient(name, phone));
    } catch { return false; }
  }

  private async findExistingPatient(name: string, phone: string): Promise<Patient | null> {
    const normalizedName = name.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (!normalizedName || !normalizedPhone) return null;
    const clinicId = await this.resolveClinicId();
    try {
      const { results } = await this.patientRepo.searchPatientByPhone(normalizedPhone, null, clinicId);
      const match = results.find(p =>
        p.phone.trim() === normalizedPhone && p.name.trim().toLowerCase() === normalizedName
      );
      if (match) return match;
    } catch { /* fall through */ }
    try {
      const { results } = await this.patientRepo.searchPatientsContaining(normalizedPhone, clinicId);
      const match = results.find(p =>
        p.phone.trim() === normalizedPhone && p.name.trim().toLowerCase() === normalizedName
      );
      if (match) return match;
    } catch { /* fall through */ }
    return null;
  }

  // ──── PATIENT COUNT ────

  async getPatientCount(subscriptionId: string, clinicId?: string | null): Promise<number> {
    return this.patientRepo.getPatientCount(subscriptionId, clinicId);
  }
}
