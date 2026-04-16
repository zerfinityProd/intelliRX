import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { AuthenticationService } from './authenticationService';
import { PatientSearchService } from './patientSearchService';
import { ClinicContextService } from './clinicContextService';
import { Patient, Visit } from '../models/patient.model';
import {
  isValidPhone,
  isValidEmail,
  validatePatientData
} from '../utilities/patientValidation';

/**
 * Orchestrates patient operations
 *
 * Responsibilities:
 * - Patient CRUD operations
 * - Visit management
 * - Patient data validation
 * - Search and pagination coordination
 */
@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private readonly selectedPatientSubject = new BehaviorSubject<Patient | null>(null);
  public readonly selectedPatient$ = this.selectedPatientSubject.asObservable();

  // Expose search results from search service
  get searchResults$(): Observable<Patient[]> {
    return this.searchService.searchResults$;
  }

  // Expose pagination state from search service
  get hasMoreResults(): boolean {
    return this.searchService.hasMoreResults;
  }

  get isLoadingMore(): boolean {
    return this.searchService.isLoadingMore;
  }

  constructor(
    private firebaseService: FirebaseService,
    private authService: AuthenticationService,
    private searchService: PatientSearchService,
    private clinicContextService: ClinicContextService
  ) { }

  /**
   * Get current authenticated user ID
   */
  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    return userId;
  }

  /** Get the active clinic context */
  private getClinicId(): string | undefined {
    return this.clinicContextService.getSelectedClinicId() || undefined;
  }

  // ──── SEARCH & PAGINATION ────

  /**
   * Search for patients by term (resets pagination)
   */
  async searchPatients(searchTerm: string): Promise<void> {
    await this.searchService.search(searchTerm);
  }

  /**
   * Load next page of search results
   */
  async loadMorePatients(): Promise<void> {
    await this.searchService.loadMore();
  }

  /**
   * Clear search results and reset state
   */
  clearSearchResults(): void {
    this.searchService.clear();
  }

  // ──── CRUD OPERATIONS ────

  /**
   * Fetch a patient by ID
   */
  async getPatient(patientId: string): Promise<Patient | null> {
    try {
      const patient = await this.firebaseService.getPatientById(patientId);
      if (patient) {
        this.selectedPatientSubject.next(patient);
      }
      return patient;
    } catch (error) {
      console.error('❌ Error fetching patient:', error);
      throw error;
    }
  }

  /**
   * Create a new patient or update existing
   */
  async createPatient(
    patientData: Omit<Patient, 'id' | 'last_updated'>
  ): Promise<string> {
    try {
      const existingPatient = await this.findExistingPatient(
        patientData.name,
        patientData.phone
      );

      if (existingPatient) {
        console.log('✓ Found existing patient, updating:', existingPatient.id);
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

      const patientId = await this.firebaseService.addPatient(fullPatientData);
      console.log('✓ Patient created:', patientId);
      return patientId;
    } catch (error) {
      console.error('❌ Error creating patient:', error);
      throw error;
    }
  }

  /**
   * Update an existing patient
   */
  async updatePatient(patientId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      await this.firebaseService.updatePatient(patientId, patientData);
      console.log('✓ Patient updated successfully');
    } catch (error) {
      console.error('❌ Error updating patient:', error);
      throw error;
    }
  }

  /**
   * Delete a patient
   */
  async deletePatient(patientId: string): Promise<void> {
    try {
      await this.firebaseService.deletePatient(patientId);
      this.selectedPatientSubject.next(null);
      console.log('✓ Patient deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting patient:', error);
      throw error;
    }
  }

  /**
   * Select a patient for context
   */
  selectPatient(patient: Patient | null): void {
    this.selectedPatientSubject.next(patient);
  }

  // ──── VISIT MANAGEMENT ────

  /**
   * Add a visit for a patient
   */
  async addVisit(
    patientId: string,
    visitData: Omit<Visit, 'id' | 'created_at'>
  ): Promise<string> {
    try {
      const visitWithPatient = {
        ...visitData,
        patient_id: patientId,
      };
      const visitId = await this.firebaseService.addVisit(visitWithPatient);
      console.log('✓ Visit added successfully:', visitId);
      return visitId;
    } catch (error) {
      console.error('❌ Error adding visit:', error);
      throw error;
    }
  }

  /**
   * Get all visits for a patient
   */
  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      const visits = await this.firebaseService.getPatientVisits(patientId);
      return visits;
    } catch (error) {
      console.error('❌ Error fetching visits:', error);
      return [];
    }
  }

  /**
   * Update an existing visit
   */
  async updateVisit(patientId: string, visitId: string, visitData: Partial<Visit>): Promise<void> {
    try {
      await this.firebaseService.updateVisit(visitId, visitData);
      console.log('✓ Visit updated successfully');
    } catch (error) {
      console.error('❌ Error updating visit:', error);
      throw error;
    }
  }

  /**
   * Delete a visit
   */
  async deleteVisit(patientId: string, visitId: string): Promise<void> {
    try {
      await this.firebaseService.deleteVisit(visitId);
      console.log('✓ Visit deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting visit:', error);
      throw error;
    }
  }

  // ──── VALIDATION ────

  isValidPhone(phone: string): boolean {
    return isValidPhone(phone);
  }

  isValidEmail(email: string): boolean {
    return isValidEmail(email);
  }

  validatePatientData(data: {
    name?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date | string;
    gender?: string;
  }): { valid: boolean; errors: string[] } {
    return validatePatientData(data);
  }

  // ──── EXISTENCE CHECKS ────

  /**
   * Find a patient by phone number alone (returns first match or null).
   */
  async findPatientByPhone(phone: string): Promise<Patient | null> {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) return null;
    const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;

    // Strategy 1: indexed phone search scoped by clinicId
    try {
      const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, null, clinicId);
      const exact = results.filter(p => p.phone.trim() === normalizedPhone);
      if (exact.length > 0) return exact[0];
    } catch {
      // fall through
    }

    // Strategy 2: client-side contains search
    try {
      const { results } = await this.firebaseService.searchPatientsContaining(normalizedPhone, clinicId);
      const exact = results.filter(p => p.phone.trim() === normalizedPhone);
      if (exact.length > 0) return exact[0];
    } catch {
      // fall through
    }

    // Strategy 3: search without clinicId
    if (clinicId) {
      try {
        const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, null, undefined);
        const exact = results.filter(p => p.phone.trim() === normalizedPhone);
        if (exact.length > 0) return exact[0];
      } catch {
        // fall through
      }
    }

    return null;
  }

  /**
   * Check if a patient exists with name+phone combo
   */
  async checkPatientExists(name: string, phone: string): Promise<boolean> {
    try {
      if (!name.trim() || !phone.trim()) return false;
      const existingPatient = await this.findExistingPatient(name, phone);
      return !!existingPatient;
    } catch (error) {
      console.error('❌ Error checking patient:', error);
      return false;
    }
  }

  /**
   * Private: Find existing patient by name and phone (uses multiple fallback strategies)
   */
  private async findExistingPatient(
    name: string,
    phone: string
  ): Promise<Patient | null> {
    const normalizedName = name.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (!normalizedName || !normalizedPhone) return null;

    const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;

    // Strategy 1: indexed phone search scoped by clinicId
    try {
      const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, null, clinicId);
      const match = results.find(p => p.phone.trim() === normalizedPhone && p.name.trim().toLowerCase() === normalizedName);
      if (match) return match;
    } catch {
      // fall through
    }

    // Strategy 2: client-side contains search
    try {
      const { results } = await this.firebaseService.searchPatientsContaining(normalizedPhone, clinicId);
      const match = results.find(p => p.phone.trim() === normalizedPhone && p.name.trim().toLowerCase() === normalizedName);
      if (match) return match;
    } catch {
      // fall through
    }

    // Strategy 3: search without clinicId
    if (clinicId) {
      try {
        const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, null, undefined);
        const match = results.find(p => p.phone.trim() === normalizedPhone && p.name.trim().toLowerCase() === normalizedName);
        if (match) return match;
      } catch {
        // fall through
      }
    }

    return null;
  }
}
