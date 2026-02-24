import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { AuthService } from './auth';
import { Patient, Visit } from '../models/patient.model';
import { QueryDocumentSnapshot, DocumentData } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private searchResultsSubject = new BehaviorSubject<Patient[]>([]);
  public searchResults$: Observable<Patient[]> = this.searchResultsSubject.asObservable();

  private selectedPatientSubject = new BehaviorSubject<Patient | null>(null);
  public selectedPatient$: Observable<Patient | null> = this.selectedPatientSubject.asObservable();

  // Pagination state
  private lastPhoneDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  private lastFamilyDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  private lastNameDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  private currentSearchTerm: string = '';
  private currentIsNumeric: boolean = false;

  public hasMoreResults: boolean = false;
  public isLoadingMore: boolean = false;

  private lastSearchTerm: string = '';
  private lastSearchResults: Patient[] = [];

  constructor(
    private firebaseService: FirebaseService,
    private authService: AuthService,
    private ngZone: NgZone
  ) {}

  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    return userId;
  }

  async findExistingPatient(name: string, phone: string): Promise<Patient | null> {
    try {
      const userId = this.getCurrentUserId();
      const normalizedName = name.trim().toLowerCase();
      const normalizedPhone = phone.trim();

      const { results: phoneMatches } = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId);
      if (phoneMatches.length === 0) return null;

      const exactMatches = phoneMatches.filter(p => p.name.trim().toLowerCase() === normalizedName);
      if (exactMatches.length === 0) return null;

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

  generateUniqueIdPreview(name: string, phone: string, userId: string): string {
    const nameParts = name.trim().split(' ').filter(p => p.length > 0);
    const firstName = (nameParts[0] || '').toLowerCase();
    const lastName = (nameParts[nameParts.length - 1] || firstName).toLowerCase();
    const cleanPhone = phone.trim();
    return `${firstName}_${lastName}_${cleanPhone}_${userId}`;
  }

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

  async checkFamilyIdExists(familyId: string): Promise<boolean> {
    try {
      const userId = this.getCurrentUserId();
      const normalizedFamilyId = familyId.trim().toLowerCase();
      if (!normalizedFamilyId) return false;
      const { results } = await this.firebaseService.searchPatientByFamilyId(normalizedFamilyId, userId);
      const exactMatch = results.find(p => p.familyId.toLowerCase() === normalizedFamilyId);
      return !!exactMatch;
    } catch (error) {
      console.error('Error checking family ID:', error);
      return false;
    }
  }

  async createPatient(patientData: Omit<Patient, 'uniqueId' | 'userId' | 'familyId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const userId = this.getCurrentUserId();
      const existingPatient = await this.findExistingPatient(patientData.name, patientData.phone);

      if (existingPatient) {
        console.log('Found existing patient, updating:', existingPatient.uniqueId);
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

      const familyId = this.firebaseService.generateFamilyId(patientData.name, patientData.phone);
      const patientWithUserId = { ...patientData, familyId, userId };
      const uniqueId = await this.firebaseService.addPatient(patientWithUserId, userId);

      this.lastSearchTerm = '';
      this.lastSearchResults = [];
      return uniqueId;
    } catch (error) {
      console.error('Error creating/updating patient:', error);
      throw error;
    }
  }

  async updatePatient(uniqueId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      const userId = this.getCurrentUserId();
      await this.firebaseService.updatePatient(uniqueId, patientData, userId);
      this.lastSearchTerm = '';
      this.lastSearchResults = [];
      console.log('Patient updated successfully');
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  async addVisit(patientId: string, visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const userId = this.getCurrentUserId();
      const visitId = await this.firebaseService.addVisit(patientId, visitData, userId);
      console.log('Visit added successfully');
      return visitId;
    } catch (error) {
      console.error('Error adding visit:', error);
      throw error;
    }
  }

  /**
   * Search patients — first page (resets pagination state)
   */
  async searchPatients(searchTerm: string): Promise<void> {
    try {
      const userId = this.getCurrentUserId();
      const trimmedTerm = searchTerm.trim();

      // Reset pagination
      this.lastPhoneDoc = null;
      this.lastFamilyDoc = null;
      this.lastNameDoc = null;
      this.currentSearchTerm = trimmedTerm;
      this.currentIsNumeric = /^\d+$/.test(trimmedTerm);
      this.hasMoreResults = false;

      console.log('Searching for:', trimmedTerm);

      let allResults: Patient[] = [];

      if (this.currentIsNumeric) {
        const { results, lastDoc, hasMore } = await this.firebaseService.searchPatientByPhone(trimmedTerm, userId);
        allResults = results;
        this.lastPhoneDoc = lastDoc;
        this.hasMoreResults = hasMore;
      } else {
        const [familySettled, nameSettled] = await Promise.allSettled([
          this.firebaseService.searchPatientByFamilyId(trimmedTerm.toLowerCase(), userId),
          this.firebaseService.searchPatientByName(trimmedTerm, userId)
        ]);

        const familyResult = familySettled.status === 'fulfilled' ? familySettled.value : { results: [], lastDoc: null, hasMore: false };
        const nameResult = nameSettled.status === 'fulfilled' ? nameSettled.value : { results: [], lastDoc: null, hasMore: false };

        this.lastFamilyDoc = familyResult.lastDoc;
        this.lastNameDoc = nameResult.lastDoc;
        this.hasMoreResults = familyResult.hasMore || nameResult.hasMore;

        const seen = new Set<string>();
        for (const patient of [...familyResult.results, ...nameResult.results]) {
          if (!seen.has(patient.uniqueId)) {
            seen.add(patient.uniqueId);
            allResults.push(patient);
          }
        }
      }

      // Sort by newest first
      allResults.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

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
   * Load next page of results (appends to current results)
   */
  async loadMorePatients(): Promise<void> {
    if (!this.hasMoreResults || this.isLoadingMore) return;

    try {
      const userId = this.getCurrentUserId();
      this.isLoadingMore = true;
      const trimmedTerm = this.currentSearchTerm;

      let newResults: Patient[] = [];

      if (this.currentIsNumeric) {
        const { results, lastDoc, hasMore } = await this.firebaseService.searchPatientByPhone(trimmedTerm, userId, this.lastPhoneDoc);
        newResults = results;
        this.lastPhoneDoc = lastDoc;
        this.hasMoreResults = hasMore;
      } else {
        const [familySettled, nameSettled] = await Promise.allSettled([
          this.lastFamilyDoc !== undefined
            ? this.firebaseService.searchPatientByFamilyId(trimmedTerm.toLowerCase(), userId, this.lastFamilyDoc)
            : Promise.resolve({ results: [], lastDoc: null, hasMore: false }),
          this.lastNameDoc !== undefined
            ? this.firebaseService.searchPatientByName(trimmedTerm, userId, this.lastNameDoc)
            : Promise.resolve({ results: [], lastDoc: null, hasMore: false })
        ]);

        const familyResult = familySettled.status === 'fulfilled' ? familySettled.value : { results: [], lastDoc: null, hasMore: false };
        const nameResult = nameSettled.status === 'fulfilled' ? nameSettled.value : { results: [], lastDoc: null, hasMore: false };

        this.lastFamilyDoc = familyResult.lastDoc;
        this.lastNameDoc = nameResult.lastDoc;
        this.hasMoreResults = familyResult.hasMore || nameResult.hasMore;

        const existingIds = new Set(this.lastSearchResults.map(p => p.uniqueId));
        for (const patient of [...familyResult.results, ...nameResult.results]) {
          if (!existingIds.has(patient.uniqueId)) {
            existingIds.add(patient.uniqueId);
            newResults.push(patient);
          }
        }
      }

      newResults.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      const combined = [...this.lastSearchResults, ...newResults];
      this.lastSearchResults = combined;

      this.ngZone.run(() => {
        this.searchResultsSubject.next(combined);
      });

    } catch (error) {
      console.error('Error loading more patients:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  clearSearchResults(): void {
    this.lastSearchTerm = '';
    this.lastSearchResults = [];
    this.lastPhoneDoc = null;
    this.lastFamilyDoc = null;
    this.lastNameDoc = null;
    this.hasMoreResults = false;
    this.ngZone.run(() => {
      this.searchResultsSubject.next([]);
    });
  }

  selectPatient(patient: Patient | null): void {
    this.ngZone.run(() => {
      this.selectedPatientSubject.next(patient);
    });
  }

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

  async deleteVisit(patientId: string, visitId: string): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.firebaseService.deleteVisit(patientId, visitId, userId);
  }

  async deletePatient(uniqueId: string): Promise<void> {
    const userId = this.getCurrentUserId();
    await this.firebaseService.deletePatient(uniqueId, userId);
    this.lastSearchTerm = '';
    this.lastSearchResults = [];
  }

  isValidPhone(phone: string): boolean {
    return /^\d{10}$/.test(phone.trim());
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }
}