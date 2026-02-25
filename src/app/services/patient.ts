import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { AuthenticationService } from './authenticationService';
import { PatientSearchService } from './patientSearchService';
import { PatientCRUDService } from './patientCRUDService';
import { PatientVisitService } from './patientVisitService';
import { PatientValidationService } from './patientValidationService';
import { Patient, Visit } from '../models/patient.model';

/**
 * Orchestrates patient operations by delegating to specialized services
 * Maintains backward compatibility with existing components
 *
 * Single responsibility: Coordinate patient-related operations
 * Delegates to:
 * - PatientSearchService: Search and pagination
 * - PatientCRUDService: Create, read, update, delete
 * - PatientVisitService: Visit management
 * - PatientValidationService: Data validation
 */
@Injectable({
  providedIn: 'root'
})
export class PatientService {
  // Expose search results from search service
  get searchResults$(): Observable<Patient[]> {
    return this.searchService.searchResults$;
  }

  // Expose selected patient from CRUD service
  get selectedPatient$(): Observable<Patient | null> {
    return this.crudService.selectedPatient$;
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
    private crudService: PatientCRUDService,
    private visitService: PatientVisitService,
    private validationService: PatientValidationService
  ) { }

  /**
   * Get current authenticated user ID
   */
  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    return userId;
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
   * Get a patient by unique ID
   */
  async getPatient(uniqueId: string): Promise<Patient | null> {
    const userId = this.getCurrentUserId();
    return this.crudService.getPatient(uniqueId, userId);
  }

  /**
   * Create a new patient or update existing
   */
  async createPatient(
    patientData: Omit<Patient, 'uniqueId' | 'userId' | 'familyId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const userId = this.getCurrentUserId();
    return this.crudService.createPatient(patientData, userId, this.firebaseService);
  }

  /**
   * Update an existing patient
   */
  async updatePatient(uniqueId: string, patientData: Partial<Patient>): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.crudService.updatePatient(uniqueId, patientData, userId);
  }

  /**
   * Delete a patient
   */
  async deletePatient(uniqueId: string): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.crudService.deletePatient(uniqueId, userId);
  }

  /**
   * Select a patient for context
   */
  selectPatient(patient: Patient | null): void {
    this.crudService.selectPatient(patient);
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
    return this.visitService.addVisit(patientId, visitData, userId);
  }

  /**
   * Get all visits for a patient
   */
  async getPatientVisits(patientId: string): Promise<Visit[]> {
    const userId = this.getCurrentUserId();
    return this.visitService.getVisits(patientId, userId);
  }

  /**
   * Delete a visit
   */
  async deleteVisit(patientId: string, visitId: string): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.visitService.deleteVisit(patientId, visitId, userId);
  }

  // ──── VALIDATION ────

  /**
   * Validate phone number format
   */
  isValidPhone(phone: string): boolean {
    return this.validationService.isValidPhone(phone);
  }

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    return this.validationService.isValidEmail(email);
  }

  /**
   * Comprehensive patient data validation
   */
  validatePatientData(data: {
    name?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date | string;
    gender?: string;
  }): { valid: boolean; errors: string[] } {
    return this.validationService.validatePatientData(data);
  }

  // ──── EXISTENCE CHECKS ────

  /**
   * Check if a unique ID exists
   */
  async checkUniqueIdExists(name: string, phone: string): Promise<boolean> {
    const userId = this.getCurrentUserId();
    return this.crudService.checkUniqueIdExists(name, phone, userId);
  }

  /**
   * Check if a family ID exists
   */
  async checkFamilyIdExists(familyId: string): Promise<boolean> {
    const userId = this.getCurrentUserId();
    return this.crudService.checkFamilyIdExists(familyId, userId);
  }
}
