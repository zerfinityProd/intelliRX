import { Injectable, NgZone } from '@angular/core';
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

  // Local cache for INSTANT results
  private lastSearchTerm: string = '';
  private lastSearchResults: Patient[] = [];

  constructor(
    private firebaseService: FirebaseService,
    private ngZone: NgZone
  ) {}

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
   * Search patients by phone number or family ID - OPTIMIZED FOR INSTANT RESULTS
   */
  async searchPatients(searchTerm: string): Promise<Patient[]> {
    try {
      console.log('🔍 searchPatients called with:', searchTerm);
      
      // ⚡ INSTANT: Check if we have exact same search cached
      if (searchTerm === this.lastSearchTerm && this.lastSearchResults.length > 0) {
        console.log('⚡ INSTANT CACHE HIT - Showing results immediately!');
        this.updateResults(this.lastSearchResults);
        return this.lastSearchResults;
      }

      // ⚡ INSTANT: For partial searches, show matching cached results immediately
      if (this.lastSearchTerm && searchTerm.startsWith(this.lastSearchTerm) && this.lastSearchResults.length > 0) {
        const filteredResults = this.filterCachedResults(searchTerm);
        if (filteredResults.length > 0) {
          console.log('⚡ INSTANT PARTIAL CACHE - Showing filtered results!');
          this.updateResults(filteredResults);
          // Still fetch from Firebase in background for accuracy
          this.fetchFromFirebase(searchTerm);
          return filteredResults;
        }
      }

      // Fetch from Firebase
      const results = await this.fetchFromFirebase(searchTerm);
      return results;
    } catch (error) {
      console.error('Error searching patients:', error);
      this.updateResults([]);
      throw error;
    }
  }

  /**
   * Fetch from Firebase and update cache - with NgZone for proper change detection
   */
  private async fetchFromFirebase(searchTerm: string): Promise<Patient[]> {
    let results: Patient[] = [];
    
    console.log('📡 Fetching from Firebase:', searchTerm);
    
    // If search term is numeric, search by phone
    if (/^\d+$/.test(searchTerm)) {
      results = await this.firebaseService.searchPatientByPhone(searchTerm);
    } else {
      // Otherwise search by family ID
      results = await this.firebaseService.searchPatientByFamilyId(searchTerm.toLowerCase());
    }
    
    console.log('📡 Firebase returned:', results.length, 'results');
    
    // Update cache
    this.lastSearchTerm = searchTerm;
    this.lastSearchResults = results;
    
    // Update UI with NgZone
    this.updateResults(results);
    
    return results;
  }

  /**
   * Update results with proper zone handling
   */
  private updateResults(results: Patient[]): void {
    this.ngZone.run(() => {
      console.log('✅ Updating searchResultsSubject with', results.length, 'results');
      this.searchResultsSubject.next(results);
    });
  }

  /**
   * Filter cached results for partial matches
   */
  private filterCachedResults(searchTerm: string): Patient[] {
    if (/^\d+$/.test(searchTerm)) {
      // Phone number search - filter by phone prefix
      return this.lastSearchResults.filter(p => p.phone.startsWith(searchTerm));
    } else {
      // Family ID search - filter by family ID prefix
      const term = searchTerm.toLowerCase();
      return this.lastSearchResults.filter(p => 
        p.familyId.toLowerCase().startsWith(term) ||
        p.name.toLowerCase().includes(term)
      );
    }
  }

  /**
   * Get patient by ID
   */
  async getPatient(uniqueId: string): Promise<Patient | null> {
    try {
      const patient = await this.firebaseService.getPatientById(uniqueId);
      if (patient) {
        this.ngZone.run(() => {
          this.selectedPatientSubject.next(patient);
        });
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
          this.ngZone.run(() => {
            this.selectedPatientSubject.next(updatedPatient);
          });
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
    this.updateResults([]);
    // Keep cache for faster subsequent searches
  }

  /**
   * Set selected patient
   */
  setSelectedPatient(patient: Patient | null): void {
    this.ngZone.run(() => {
      this.selectedPatientSubject.next(patient);
    });
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