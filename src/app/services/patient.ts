
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { Patient, Visit } from '../models/patient.model';


@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private searchResultsSubject = new BehaviorSubject<Patient[]>([]);
  public searchResults$: Observable<Patient[]> = this.searchResultsSubject.asObservable();

  private selectedPatientSubject = new BehaviorSubject<Patient | null>(null);
  public selectedPatient$: Observable<Patient | null> = this.selectedPatientSubject.asObservable();

  constructor(private firebaseService: FirebaseService) {}

  /**
   * Create a new patient
   */
  async createPatient(patientData: Omit<Patient, 'uniqueId' | 'familyId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const familyId = this.firebaseService.generateFamilyId(patientData.name);
      const uniqueId = await this.firebaseService.addPatient({
        ...patientData,
        familyId
      });
      return uniqueId;
    } catch (error) {
      console.error('Error creating patient:', error);
      throw error;
    }
  }

  /**
   * Search patients by phone number or family ID
   */
  async searchPatients(searchTerm: string): Promise<Patient[]> {
    try {
      let results: Patient[] = [];
      
      // If search term is numeric, search by phone
      if (/^\d+$/.test(searchTerm)) {
        results = await this.firebaseService.searchPatientByPhone(searchTerm);
      } else {
        // Otherwise search by family ID
        results = await this.firebaseService.searchPatientByFamilyId(searchTerm.toLowerCase());
      }
      
      this.searchResultsSubject.next(results);
      return results;
    } catch (error) {
      console.error('Error searching patients:', error);
      this.searchResultsSubject.next([]);
      throw error;
    }
  }

  /**
   * Get patient by ID
   */
  async getPatient(uniqueId: string): Promise<Patient | null> {
    try {
      const patient = await this.firebaseService.getPatientById(uniqueId);
      if (patient) {
        this.selectedPatientSubject.next(patient);
      }
      return patient;
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  /**
   * Update patient information
   */
  async updatePatient(uniqueId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      await this.firebaseService.updatePatient(uniqueId, patientData);
      
      // Update selected patient if it's the same
      const currentSelected = this.selectedPatientSubject.value;
      if (currentSelected && currentSelected.uniqueId === uniqueId) {
        const updatedPatient = await this.firebaseService.getPatientById(uniqueId);
        if (updatedPatient) {
          this.selectedPatientSubject.next(updatedPatient);
        }
      }
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  /**
   * Add a visit for a patient
   */
  async addVisit(patientId: string, visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      return await this.firebaseService.addVisit(patientId, visitData);
    } catch (error) {
      console.error('Error adding visit:', error);
      throw error;
    }
  }

  /**
   * Get patient visits
   */
  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      return await this.firebaseService.getPatientVisits(patientId);
    } catch (error) {
      console.error('Error getting visits:', error);
      throw error;
    }
  }

  /**
   * Clear search results
   */
  clearSearchResults(): void {
    this.searchResultsSubject.next([]);
  }

  /**
   * Set selected patient
   */
  setSelectedPatient(patient: Patient | null): void {
    this.selectedPatientSubject.next(patient);
  }

  /**
   * Validate phone number
   */
  isValidPhone(phone: string): boolean {
    return /^\d{10}$/.test(phone);
  }

  /**
   * Validate email
   */
  isValidEmail(email: string): boolean {
    if (!email) return true; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}