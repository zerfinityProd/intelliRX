import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { AuthService } from './auth';
import { Patient, Visit } from '../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private searchResultsSubject = new BehaviorSubject<Patient[]>([]);
  public searchResults$: Observable<Patient[]> = this.searchResultsSubject.asObservable();

  private selectedPatientSubject = new BehaviorSubject<Patient | null>(null);
  public selectedPatient$: Observable<Patient | null> = this.selectedPatientSubject.asObservable();

  private lastSearchTerm: string = '';
  private lastSearchResults: Patient[] = [];

  constructor(
    private firebaseService: FirebaseService,
    private authService: AuthService,
    private ngZone: NgZone
  ) {}

  /**
   * Get current user ID - throws error if not authenticated
   */
  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return userId;
  }

  /**
   * Find existing patient by name and phone
   * Returns the NEWEST matching record if exists
   */
  async findExistingPatient(name: string, phone: string): Promise<Patient | null> {
    try {
      const userId = this.getCurrentUserId();
      const normalizedName = name.trim().toLowerCase();
      const normalizedPhone = phone.trim();
      
      const phoneMatches = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId);
      
      if (phoneMatches.length === 0) {
        return null;
      }
      
      const exactMatches = phoneMatches.filter(patient => 
        patient.name.trim().toLowerCase() === normalizedName
      );
      
      if (exactMatches.length === 0) {
        return null;
      }
      
      const sorted = exactMatches.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      return sorted[0];
    } catch (error) {
      console.error('Error finding existing patient:', error);
      return null;
    }
  }

  /**
   * Generate the uniqueId for a given name, phone, and userId
   * Format: firstname_lastname_phonenumber_userId
   */
  generateUniqueIdPreview(name: string, phone: string, userId: string): string {
    const nameParts = name.trim().split(' ').filter(p => p.length > 0);
    const firstName = (nameParts[0] || '').toLowerCase();
    const lastName = (nameParts[nameParts.length - 1] || firstName).toLowerCase();
    const cleanPhone = phone.trim();
    return `${firstName}_${lastName}_${cleanPhone}_${userId}`;
  }

  /**
   * Check if a patient with the given unique ID already exists
   */
  async checkUniqueIdExists(name: string, phone: string): Promise<boolean> {
    try {
      const userId = this.getCurrentUserId();
      if (!name.trim() || !phone.trim()) return false;

      const uniqueId = this.generateUniqueIdPreview(name, phone, userId);
      const patient = await this.firebaseService.getPatientById(uniqueId, userId);
      return !!patient;
    } catch (error) {
      console.error('Error checking unique ID:', error);
      return false;
    }
  }

  /**
   * Check if a patient with the given family ID already exists
   * @deprecated Use checkUniqueIdExists instead
   */
  async checkFamilyIdExists(familyId: string): Promise<boolean> {
    try {
      const userId = this.getCurrentUserId();
      const normalizedFamilyId = familyId.trim().toLowerCase();
      
      if (!normalizedFamilyId) {
        return false;
      }
      
      const results = await this.firebaseService.searchPatientByFamilyId(normalizedFamilyId, userId);
      
      // Check for exact match
      const exactMatch = results.find(patient => 
        patient.familyId.toLowerCase() === normalizedFamilyId
      );
      
      return !!exactMatch;
    } catch (error) {
      console.error('Error checking family ID:', error);
      return false;
    }
  }

  /**
   * Create a new patient OR update existing if found
   * Returns the patient ID (existing or new)
   */
  async createPatient(patientData: Omit<Patient, 'uniqueId' | 'userId' | 'familyId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const userId = this.getCurrentUserId();
      
      // Check for existing patient with same name and phone
      const existingPatient = await this.findExistingPatient(patientData.name, patientData.phone);
      
      if (existingPatient) {
        console.log('ðŸ”„ Found existing patient, updating basic info:', existingPatient.uniqueId);
        
        const updateData: Partial<Patient> = {
          name: patientData.name,
          phone: patientData.phone,
          email: patientData.email || existingPatient.email,
          dateOfBirth: patientData.dateOfBirth || existingPatient.dateOfBirth,
          gender: patientData.gender || existingPatient.gender,
          allergies: patientData.allergies || existingPatient.allergies
        };
        
        await this.updatePatient(existingPatient.uniqueId, updateData);
        
        this.lastSearchTerm = '';
        this.lastSearchResults = [];
        
        return existingPatient.uniqueId;
      }
      
      // New patient - create new record with phone number in family ID
      const familyId = this.firebaseService.generateFamilyId(patientData.name, patientData.phone);
      
      const patientWithUserId = {
        ...patientData,
        familyId,
        userId
      };
      
      const uniqueId = await this.firebaseService.addPatient(patientWithUserId, userId);
      
      console.log('ðŸ“ Patient created, invalidating cache');
      this.lastSearchTerm = '';
      this.lastSearchResults = [];
      
      return uniqueId;
    } catch (error) {
      console.error('Error creating/updating patient:', error);
      throw error;
    }
  }

  /**
   * Update patient information
   */
  async updatePatient(uniqueId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      const userId = this.getCurrentUserId();
      await this.firebaseService.updatePatient(uniqueId, patientData, userId);
      
      this.lastSearchTerm = '';
      this.lastSearchResults = [];
      
      console.log('âœ… Patient updated successfully');
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  /**
   * Add a visit to a patient
   */
  async addVisit(patientId: string, visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const userId = this.getCurrentUserId();
      const visitId = await this.firebaseService.addVisit(patientId, visitData, userId);
      console.log('âœ… Visit added successfully');
      return visitId;
    } catch (error) {
      console.error('Error adding visit:', error);
      throw error;
    }
  }
  /**
 * Search patients - shows ALL records, sorted by newest first
 */
async searchPatients(searchTerm: string): Promise<void> {
  try {
    const userId = this.getCurrentUserId();
    const trimmedTerm = searchTerm.trim();

    if (trimmedTerm === this.lastSearchTerm && this.lastSearchResults.length > 0) {
      console.log('âš¡ Using cached search results');
      this.ngZone.run(() => {
        this.searchResultsSubject.next(this.lastSearchResults);
      });
      return;
    }

    console.log('ðŸ” Searching for:', trimmedTerm);

    let allResults: Patient[] = [];

    const isNumeric = /^\d+$/.test(trimmedTerm);

    if (isNumeric) {
      // Phone search
      const phoneResults = await this.firebaseService.searchPatientByPhone(trimmedTerm, userId);
      allResults = phoneResults;
    } else {
      // Family ID search - make sure to pass lowercase
      const familyResults = await this.firebaseService.searchPatientByFamilyId(trimmedTerm.toLowerCase(), userId);
      allResults = familyResults;
    }

    // Sort by newest first
    allResults.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
    
    console.log(`ðŸ“Š Found ${allResults.length} records (showing all, newest first)`);

    this.lastSearchTerm = trimmedTerm;
    this.lastSearchResults = allResults;

    this.ngZone.run(() => {
      this.searchResultsSubject.next(allResults);
    });

  } catch (error) {
    console.error('Error searching patients:', error);
    this.ngZone.run(() => {
      this.searchResultsSubject.next([]);
    });
    throw error;
  }
}

  /**
   * Clear search results
   */
  clearSearchResults(): void {
    this.lastSearchTerm = '';
    this.lastSearchResults = [];
    this.ngZone.run(() => {
      this.searchResultsSubject.next([]);
    });
  }

  /**
   * Select a patient for viewing details
   */
  selectPatient(patient: Patient | null): void {
    this.ngZone.run(() => {
      this.selectedPatientSubject.next(patient);
    });
  }

  /**
   * Get patient by ID
   */
  async getPatient(uniqueId: string): Promise<Patient | null> {
    try {
      const userId = this.getCurrentUserId();
      const patient = await this.firebaseService.getPatientById(uniqueId, userId);
      
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
   * Get all visits for a patient
   */
  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      const userId = this.getCurrentUserId();
      const visits = await this.firebaseService.getPatientVisits(patientId, userId);
      return visits;
    } catch (error) {
      console.error('Error getting visits:', error);
      return [];
    }
  }

  /**
   * Validation helpers
   */
  isValidPhone(phone: string): boolean {
    return /^\d{10}$/.test(phone.trim());
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }
}