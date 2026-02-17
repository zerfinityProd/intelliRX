import { Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
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
  orderBy
} from '@angular/fire/firestore';
import { Patient, Visit } from '../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private patientsCollection: CollectionReference<DocumentData>;
  
  // In-memory cache for faster repeated queries
  private patientCache: Map<string, { patient: Patient; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(private db: Firestore) {
    this.patientsCollection = collection(this.db, 'patients');
  }

  /**
   * Generate unique ID from family ID and user ID
   * Format: familyId_userId
   */
  private generateUniqueId(familyId: string, userId: string): string {
    return `${familyId}_${userId}`;
  }

  /**
   * Generate family ID from name and phone number
   * Format: lastname_firstname_phonenumber
   */
  generateFamilyId(name: string, phone: string): string {
    const nameParts = name.trim().split(' ');
    const cleanPhone = phone.trim();
    
    if (nameParts.length === 1) {
      return `${nameParts[0].toLowerCase()}_${cleanPhone}`;
    }
    
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    return `${lastName}_${firstName}_${cleanPhone}`;
  }

  /**
   * Add a new patient to Firebase (with userId)
   * The patientData should already include userId from the calling service
   */
  async addPatient(
    patientData: Omit<Patient, 'uniqueId' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<string> {
    try {
      const uniqueId = this.generateUniqueId(patientData.familyId, userId);
      const patientDoc = doc(this.patientsCollection, uniqueId);

      const patient: Patient = {
        ...patientData,
        uniqueId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Clean the data before saving
      const cleanedPatient = this.removeUndefinedFields(patient);

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
   * Search patient by phone number (user-specific)
   * Returns ALL records for the phone number, sorted by newest first
   */
  async searchPatientByPhone(phone: string, userId: string): Promise<Patient[]> {
    try {
      // Don't use cache for phone searches - always get fresh data
      console.log('🔎 Searching for all records with phone:', phone);

      // Query with userId filter for security, ordered by creation date (newest first)
      const q = query(
        this.patientsCollection,
        where('userId', '==', userId),
        where('phone', '==', phone),
        orderBy('createdAt', 'desc')  // Newest first
        // No limit - get ALL records for this phone number
      );
      
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => this.convertFromFirestore(doc.data()));
      
      // Cache results
      results.forEach(patient => this.addToCache(patient.uniqueId, patient));
      
      console.log(`✅ Phone search completed: Found ${results.length} record(s), sorted by newest first`);
      return results;
    } catch (error) {
      console.error('Error searching patient by phone:', error);
      throw error;
    }
  }

  /**
   * Search patient by family ID (user-specific)
   */
  async searchPatientByFamilyId(familyId: string, userId: string): Promise<Patient[]> {
    try {
      // Don't use cache - always get fresh data
      console.log('👨‍👩‍👧‍👦 Searching for family ID:', familyId);

      const searchTerm = familyId.toLowerCase().trim();
      
      // Query with userId filter for security
      const q = query(
        this.patientsCollection,
        where('userId', '==', userId),
        where('familyId', '>=', searchTerm),
        where('familyId', '<=', searchTerm + '\uf8ff'),
        orderBy('familyId'),
        orderBy('createdAt', 'desc')  // Within same family, newest first
      );
      
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => this.convertFromFirestore(doc.data()));
      
      // Cache results
      results.forEach(patient => this.addToCache(patient.uniqueId, patient));
      
      console.log(`✅ Family ID search completed: Found ${results.length} record(s)`);
      return results;
    } catch (error) {
      console.error('Error searching patient by family ID:', error);
      throw error;
    }
  }

  /**
   * Get patient by unique ID (with userId verification)
   */
  async getPatientById(uniqueId: string, userId: string): Promise<Patient | null> {
    try {
      // Check cache first
      const cached = this.getFromCache(uniqueId);
      if (cached && cached.userId === userId) {
        console.log('⚡️ Returning cached patient data');
        return cached;
      }

      const patientDoc = doc(this.patientsCollection, uniqueId);
      const docSnap = await getDoc(patientDoc);
      
      if (docSnap.exists()) {
        const patient = this.convertFromFirestore(docSnap.data());
        
        // Verify that the patient belongs to the requesting user
        if (patient.userId !== userId) {
          console.error('🚫 Unauthorized access attempt');
          return null;
        }
        
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
   * Update patient information (with userId verification)
   */
  async updatePatient(uniqueId: string, patientData: Partial<Patient>, userId: string): Promise<void> {
    try {
      // First verify the patient belongs to this user
      const existingPatient = await this.getPatientById(uniqueId, userId);
      if (!existingPatient) {
        throw new Error('Patient not found or unauthorized');
      }

      const patientDoc = doc(this.patientsCollection, uniqueId);
      
      // Remove fields that should never be updated
      const { createdAt, uniqueId: _, userId: __, ...dataWithoutProtectedFields } = patientData as any;
      
      const updateData = {
        ...dataWithoutProtectedFields,
        updatedAt: new Date()
      };
      
      const cleanedUpdate = this.removeUndefinedFields(updateData);
      await updateDoc(patientDoc, this.convertToFirestore(cleanedUpdate));
      
      // Invalidate cache
      this.removeFromCache(uniqueId);
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  /**
   * Add a visit to a patient (with userId verification)
   */
  async addVisit(
    patientId: string, 
    visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<string> {
    try {
      // Verify patient belongs to user
      const patient = await this.getPatientById(patientId, userId);
      if (!patient) {
        throw new Error('Patient not found or unauthorized');
      }

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
   * Get all visits for a patient (with userId verification)
   */
  async getPatientVisits(patientId: string, userId: string): Promise<Visit[]> {
    try {
      // Verify patient belongs to user
      const patient = await this.getPatientById(patientId, userId);
      if (!patient) {
        throw new Error('Patient not found or unauthorized');
      }

      const patientDoc = doc(this.patientsCollection, patientId);
      const visitsCollection = collection(patientDoc, 'visits');
      
      const q = query(visitsCollection, orderBy('createdAt', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => this.convertFromFirestore(doc.data()) as Visit);
    } catch (error) {
      console.error('Error getting visits:', error);
      throw error;
    }
  }

  // Cache management methods
  private addToCache(uniqueId: string, patient: Patient): void {
    this.patientCache.set(uniqueId, { patient, timestamp: Date.now() });
  }

  private getFromCache(uniqueId: string): Patient | null {
    const cached = this.patientCache.get(uniqueId);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;
    if (isExpired) {
      this.patientCache.delete(uniqueId);
      return null;
    }
    
    return cached.patient;
  }

  private removeFromCache(uniqueId: string): void {
    this.patientCache.delete(uniqueId);
  }

  private getCachedSearchResults(
    field: 'phone' | 'familyId', 
    value: string, 
    userId: string
  ): Patient[] | null {
    const cachedPatients: Patient[] = [];
    const now = Date.now();
    
    for (const [_, cached] of this.patientCache) {
      if (now - cached.timestamp > this.CACHE_DURATION) continue;
      if (cached.patient.userId !== userId) continue;
      
      if (field === 'phone' && cached.patient.phone === value) {
        cachedPatients.push(cached.patient);
      } else if (field === 'familyId') {
        const patientFamilyId = cached.patient.familyId.toLowerCase();
        const searchValue = value.toLowerCase();
        if (patientFamilyId.includes(searchValue)) {
          cachedPatients.push(cached.patient);
        }
      }
    }
    
    return cachedPatients.length > 0 ? cachedPatients : null;
  }

  public clearCache(): void {
    this.patientCache.clear();
    console.log('🗑️ Cache cleared');
  }

  private convertToFirestore(data: any): any {
    const converted: any = {};
    
    for (const key in data) {
      const value = data[key];
      if (value === undefined) continue;
      
      if (value instanceof Date) {
        converted[key] = Timestamp.fromDate(value);
      } else {
        converted[key] = value;
      }
    }
    
    return converted;
  }

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