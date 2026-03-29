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
 * Merged from PatientCRUDService, PatientVisitService, and PatientValidationService
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

  /** Get the active clinic context for cross-user patient sharing */
  private getClinicId(): string | undefined {
    return this.clinicContextService.getSelectedClinicId() || undefined;
  }

  // ──── SEARCH & PAGINATION ────

  /**
   * Search for patients by term (resets pagination)
   */
  async searchPatients(searchTerm: string): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.searchService.search(searchTerm, userId);
  }

  /**
   * Load next page of search results
   */
  async loadMorePatients(): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.searchService.loadMore(userId);
  }

  /**
   * Clear search results and reset state
   */
  clearSearchResults(): void {
    this.searchService.clear();
  }

  // ──── CRUD OPERATIONS ────

  /**
   * Fetch a patient by unique ID
   */
  async getPatient(uniqueId: string): Promise<Patient | null> {
    const userId = this.getCurrentUserId();
    const clinicId = this.getClinicId();
    try {
      const patient = await this.firebaseService.getPatientById(uniqueId, userId, clinicId);
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
    patientData: Omit<Patient, 'uniqueId' | 'userId' | 'familyId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const userId = this.getCurrentUserId();
    try {
      const existingPatient = await this.findExistingPatient(
        patientData.name,
        patientData.phone,
        userId
      );

      if (existingPatient) {
        console.log('✓ Found existing patient, updating:', existingPatient.uniqueId);
        const updateData: Partial<Patient> = {
          name: patientData.name,
          phone: patientData.phone,
          email: patientData.email || existingPatient.email,
          dateOfBirth: patientData.dateOfBirth || existingPatient.dateOfBirth,
          gender: patientData.gender || existingPatient.gender,
          allergies: patientData.allergies || existingPatient.allergies,
          // Ensure ailments entered/prefilled via Appointment flow are persisted
          // even when the patient already exists.
          ailments: patientData.ailments || existingPatient.ailments
        };
        await this.updatePatient(existingPatient.uniqueId, updateData);
        return existingPatient.uniqueId;
      }

      const familyId = this.firebaseService.generateFamilyId(patientData.name, patientData.phone);
      const clinicId = patientData.clinicId || this.clinicContextService.getSelectedClinicId() || undefined;
      const patientWithUserId = { ...patientData, familyId, userId, clinicId };
      const uniqueId = await this.firebaseService.addPatient(patientWithUserId, userId);

      console.log('✓ Patient created:', uniqueId);
      return uniqueId;
    } catch (error) {
      console.error('❌ Error creating patient:', error);
      throw error;
    }
  }

  /**
   * Update an existing patient
   */
  async updatePatient(uniqueId: string, patientData: Partial<Patient>): Promise<void> {
    const userId = this.getCurrentUserId();
    const clinicId = this.getClinicId();
    try {
      await this.firebaseService.updatePatient(uniqueId, patientData, userId, clinicId);
      console.log('✓ Patient updated successfully');
    } catch (error) {
      console.error('❌ Error updating patient:', error);
      throw error;
    }
  }

  /**
   * Delete a patient
   */
  async deletePatient(uniqueId: string): Promise<void> {
    const userId = this.getCurrentUserId();
    try {
      await this.firebaseService.deletePatient(uniqueId, userId);
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
   * Add a visit to a patient
   */
  async addVisit(
    patientId: string,
    visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const userId = this.getCurrentUserId();
    const clinicId = this.getClinicId();
    try {
      const visitId = await this.firebaseService.addVisit(patientId, visitData, userId, clinicId);
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
    const userId = this.getCurrentUserId();
    const clinicId = this.getClinicId();
    try {
      const visits = await this.firebaseService.getPatientVisits(patientId, userId, clinicId);
      return visits;
    } catch (error) {
      console.error('❌ Error fetching visits:', error);
      return [];
    }
  }

  /**
   * Delete a visit
   */
  async deleteVisit(patientId: string, visitId: string): Promise<void> {
    const userId = this.getCurrentUserId();
    try {
      await this.firebaseService.deleteVisit(patientId, visitId, userId);
      console.log('✓ Visit deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting visit:', error);
      throw error;
    }
  }

  // ──── VALIDATION ────

  /**
   * Validate phone number format
   * Uses utility function from patientValidation module
   */
  isValidPhone(phone: string): boolean {
    return isValidPhone(phone);
  }

  /**
   * Validate email format
   * Uses utility function from patientValidation module
   */
  isValidEmail(email: string): boolean {
    return isValidEmail(email);
  }

  /**
   * Comprehensive patient data validation
   * Uses utility function from patientValidation module
   */
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
   * Used by Add-Patient to detect duplicates even when names vary slightly.
   * Uses multiple fallback strategies to handle missing Firestore composite indexes.
   */
  async findPatientByPhone(phone: string): Promise<Patient | null> {
    const userId = this.getCurrentUserId();
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) return null;
    const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;

    // Strategy 1: indexed phone search scoped by clinicId
    try {
      const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId, null, clinicId);
      const exact = results.filter(p => p.phone.trim() === normalizedPhone);
      if (exact.length > 0) return exact[0];
    } catch {
      // Index may be missing — fall through to next strategy
    }

    // Strategy 2: client-side contains search scoped by clinicId (no composite index needed)
    if (clinicId) {
      try {
        const { results } = await this.firebaseService.searchPatientsContaining(normalizedPhone, userId, clinicId);
        const exact = results.filter(p => p.phone.trim() === normalizedPhone);
        if (exact.length > 0) return exact[0];
      } catch {
        // fall through
      }
    }

    // Strategy 3: indexed phone search without clinicId (legacy patients)
    if (clinicId) {
      try {
        const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId, null, undefined);
        const exact = results.filter(p => !p.clinicId && p.phone.trim() === normalizedPhone);
        if (exact.length > 0) return exact[0];
      } catch {
        // fall through
      }
    }

    // Strategy 4: client-side contains search by userId (ultimate fallback)
    try {
      const { results } = await this.firebaseService.searchPatientsContaining(normalizedPhone, userId, undefined);
      const exact = results.filter(p => p.phone.trim() === normalizedPhone);
      if (exact.length > 0) return exact[0];
    } catch {
      // all strategies exhausted
    }

    return null;
  }

  /**
   * Check if a unique ID exists
   */
  async checkUniqueIdExists(name: string, phone: string): Promise<boolean> {
    const userId = this.getCurrentUserId();
    try {
      if (!name.trim() || !phone.trim()) return false;
      const existingPatient = await this.findExistingPatient(name, phone, userId);
      return !!existingPatient;
    } catch (error) {
      console.error('❌ Error checking unique ID:', error);
      return false;
    }
  }

  /**
   * Check if a family ID exists
   */
  async checkFamilyIdExists(familyId: string): Promise<boolean> {
    const userId = this.getCurrentUserId();
    try {
      const normalizedFamilyId = familyId.trim().toLowerCase();
      if (!normalizedFamilyId) return false;
      const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;
      const { results } = await this.firebaseService.searchPatientByFamilyId(normalizedFamilyId, userId, null, clinicId);
      const exactMatch = results.find(p => p.familyId.toLowerCase() === normalizedFamilyId);
      return !!exactMatch;
    } catch (error) {
      console.error('❌ Error checking family ID:', error);
      return false;
    }
  }

  /**
   * Private: Find existing patient by name and phone
   */
  private async findExistingPatient(
    name: string,
    phone: string,
    userId: string
  ): Promise<Patient | null> {
    try {
      const normalizedName = name.trim().toLowerCase();
      const normalizedPhone = phone.trim();
      const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;

      const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId, null, clinicId);
      if (results.length === 0) {
        // Fallback: search without clinicId for legacy patients
        if (clinicId) {
          const { results: legacyResults } = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId, null, undefined);
          const legacyExact = legacyResults.filter(p => !p.clinicId && p.name.trim().toLowerCase() === normalizedName);
          return legacyExact.length > 0 ? legacyExact[0] : null;
        }
        return null;
      }

      const exactMatches = results.filter(p => p.name.trim().toLowerCase() === normalizedName);
      if (exactMatches.length === 0) return null;

      // Return most recently created match
      const sorted = exactMatches.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      return sorted[0];
    } catch (error) {
      console.error('❌ Error finding existing patient:', error);
      return null;
    }
  }
}
