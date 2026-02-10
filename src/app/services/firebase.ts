import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  CollectionReference,
  DocumentData,
  Timestamp,
  limit,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { environment } from '../../environments/environment';

import { Patient, Visit } from '../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private app: FirebaseApp;
  private db: Firestore;
  private patientsCollection: CollectionReference<DocumentData>;
  
  // In-memory cache for faster repeated queries
  private patientCache: Map<string, { patient: Patient; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.app = initializeApp(environment.firebase);
    
    // Initialize Firestore with new persistence API (supports multiple tabs)
    this.db = getFirestore(this.app);
    
    this.patientsCollection = collection(this.db, 'patients');
  }

  /**
   * Generate unique ID from family ID and phone number
   */
  private generateUniqueId(familyId: string, phone: string): string {
    return `${familyId}_${phone}`;
  }

  /**
   * Generate family ID from name
   */
  generateFamilyId(name: string): string {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) {
      return nameParts[0].toLowerCase();
    }
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    return `${lastName}_${firstName}`;
  }

  /**
   * Add a new patient to Firebase (Optimized with batch operations)
   */
  async addPatient(patientData: Omit<Patient, 'uniqueId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const uniqueId = this.generateUniqueId(patientData.familyId, patientData.phone);
      const patientDoc = doc(this.patientsCollection, uniqueId);

      const patient: Patient = {
        ...patientData,
        uniqueId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Clean the data before saving - remove undefined values
      const cleanedPatient = this.removeUndefinedFields(patient);

      // Use setDoc with merge option for faster writes
      await setDoc(patientDoc, this.convertToFirestore(cleanedPatient));
      
      // Add to cache immediately
      this.addToCache(uniqueId, patient);
      
      return uniqueId;
    } catch (error) {
      console.error('Error adding patient:', error);
      throw error;
    }
  }

  /**
   * Remove undefined fields from an object
   */
  private removeUndefinedFields(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = obj[key];
      }
    }
    return cleaned;
  }

  /**
   * Search patient by phone number (Optimized with limit and cache)
   */
  async searchPatientByPhone(phone: string): Promise<Patient[]> {
    try {
      // Check cache first for instant results
      const cachedResults = this.getCachedSearchResults('phone', phone);
      if (cachedResults && cachedResults.length > 0) {
        console.log('✅ Returning cached phone search results (instant)');
        return cachedResults;
      }

      // Create optimized query with smaller limit for faster response
      const q = query(
        this.patientsCollection,
        where('phone', '==', phone),
        limit(10) // Reduced from 20 to 10 for faster queries
      );
      
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => this.convertFromFirestore(doc.data()));
      
      // Cache results for next time
      results.forEach(patient => this.addToCache(patient.uniqueId, patient));
      
      console.log(`📞 Phone search completed: ${results.length} results`);
      return results;
    } catch (error) {
      console.error('Error searching patient by phone:', error);
      
      // If error is about missing index, provide helpful message
      if (error instanceof Error && error.message.includes('index')) {
        console.error('FIRESTORE INDEX REQUIRED: Create an index for phone + createdAt');
        console.error('Click the link in the console to auto-create the index');
      }
      
      throw error;
    }
  }

  /**
   * Search patient by family ID (Optimized with prefix search)
   */
  async searchPatientByFamilyId(familyId: string): Promise<Patient[]> {
    try {
      // Check cache first for instant results
      const cachedResults = this.getCachedSearchResults('familyId', familyId);
      if (cachedResults && cachedResults.length > 0) {
        console.log('✅ Returning cached family ID search results (instant)');
        return cachedResults;
      }

      // Normalize search term
      const searchTerm = familyId.toLowerCase().trim();
      
      // Create optimized query with prefix matching
      const q = query(
        this.patientsCollection,
        where('familyId', '>=', searchTerm),
        where('familyId', '<=', searchTerm + '\uf8ff'),
        orderBy('familyId'),
        limit(10) // Reduced from 20 to 10 for faster queries
      );
      
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => this.convertFromFirestore(doc.data()));
      
      // Cache results for next time
      results.forEach(patient => this.addToCache(patient.uniqueId, patient));
      
      console.log(`👨‍👩‍👧‍👦 Family ID search completed: ${results.length} results`);
      return results;
    } catch (error) {
      console.error('Error searching patient by family ID:', error);
      
      // If error is about missing index, provide helpful message
      if (error instanceof Error && error.message.includes('index')) {
        console.error('FIRESTORE INDEX REQUIRED: Create an index for familyId');
        console.error('Click the link in the console to auto-create the index');
      }
      
      throw error;
    }
  }

  /**
   * Get patient by unique ID (Optimized with cache)
   */
  async getPatientById(uniqueId: string): Promise<Patient | null> {
    try {
      // Check cache first
      const cached = this.getFromCache(uniqueId);
      if (cached) {
        console.log('✅ Returning cached patient data (instant)');
        return cached;
      }

      const patientDoc = doc(this.patientsCollection, uniqueId);
      const docSnap = await getDoc(patientDoc);
      
      if (docSnap.exists()) {
        const patient = this.convertFromFirestore(docSnap.data());
        this.addToCache(uniqueId, patient);
        return patient;
      }
      return null;
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  /**
   * Update patient information (Optimized with cache invalidation)
   */
  async updatePatient(uniqueId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      const patientDoc = doc(this.patientsCollection, uniqueId);
      const updateData = {
        ...patientData,
        updatedAt: new Date()
      };
      
      // Clean the data before updating
      const cleanedUpdate = this.removeUndefinedFields(updateData);
      
      await updateDoc(patientDoc, this.convertToFirestore(cleanedUpdate));
      
      // Invalidate cache for this patient
      this.removeFromCache(uniqueId);
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  /**
   * Add a visit to a patient (Optimized)
   */
  async addVisit(patientId: string, visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const patientDoc = doc(this.patientsCollection, patientId);
      const visitsCollection = collection(patientDoc, 'visits');
      const visitDoc = doc(visitsCollection);
      
      const visit: Visit = {
        ...visitData,
        id: visitDoc.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(visitDoc, this.convertToFirestore(visit));
      return visitDoc.id;
    } catch (error) {
      console.error('Error adding visit:', error);
      throw error;
    }
  }

  /**
   * Get all visits for a patient (Optimized with limit and ordered by date - newest first)
   */
  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      const patientDoc = doc(this.patientsCollection, patientId);
      const visitsCollection = collection(patientDoc, 'visits');
      
      // Order by createdAt descending (newest first)
      const q = query(visitsCollection, orderBy('createdAt', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => this.convertFromFirestore(doc.data()) as Visit);
    } catch (error) {
      console.error('Error getting visits:', error);
      throw error;
    }
  }

  /**
   * Cache Management - Add patient to cache
   */
  private addToCache(uniqueId: string, patient: Patient): void {
    this.patientCache.set(uniqueId, {
      patient,
      timestamp: Date.now()
    });
  }

  /**
   * Cache Management - Get patient from cache (OPTIMIZED)
   */
  private getFromCache(uniqueId: string): Patient | null {
    const cached = this.patientCache.get(uniqueId);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;
    if (isExpired) {
      this.patientCache.delete(uniqueId);
      return null;
    }
    
    return cached.patient;
  }

  /**
   * Cache Management - Remove patient from cache
   */
  private removeFromCache(uniqueId: string): void {
    this.patientCache.delete(uniqueId);
  }

  /**
   * Cache Management - Get cached search results (OPTIMIZED)
   */
  private getCachedSearchResults(field: 'phone' | 'familyId', value: string): Patient[] | null {
    const cachedPatients: Patient[] = [];
    const now = Date.now();
    
    for (const [_, cached] of this.patientCache) {
      // Check if cache is expired (quick check first)
      if (now - cached.timestamp > this.CACHE_DURATION) {
        continue;
      }
      
      // Check if patient matches search
      if (field === 'phone' && cached.patient.phone === value) {
        cachedPatients.push(cached.patient);
      } else if (field === 'familyId') {
        // Support prefix matching for family ID
        const patientFamilyId = cached.patient.familyId.toLowerCase();
        const searchValue = value.toLowerCase();
        if (patientFamilyId.includes(searchValue)) {
          cachedPatients.push(cached.patient);
        }
      }
    }
    
    return cachedPatients.length > 0 ? cachedPatients : null;
  }

  /**
   * Clear all cache (call this on logout or when needed)
   */
  public clearCache(): void {
    this.patientCache.clear();
    console.log('🗑️ Cache cleared');
  }

  /**
   * Convert data to Firestore format (Date to Timestamp)
   */
  private convertToFirestore(data: any): any {
    const converted: any = {};
    
    for (const key in data) {
      const value = data[key];
      
      // Skip undefined values
      if (value === undefined) {
        continue;
      }
      
      if (value instanceof Date) {
        converted[key] = Timestamp.fromDate(value);
      } else {
        converted[key] = value;
      }
    }
    
    return converted;
  }

  /**
   * Convert Firestore data to application format (Timestamp to Date)
   */
  private convertFromFirestore(data: any): any {
    const converted: any = {};
    
    for (const key in data) {
      if (data[key] && typeof data[key].toDate === 'function') {
        converted[key] = data[key].toDate();
      } else {
        converted[key] = data[key];
      }
    }
    
    return converted;
  }
}