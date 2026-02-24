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
  deleteDoc,
  CollectionReference,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  limit,
  orderBy,
  startAfter
} from '@angular/fire/firestore';
import { Patient, Visit } from '../models/patient.model';

export interface PagedResult {
  results: Patient[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private patientsCollection: CollectionReference<DocumentData>;

  private patientCache: Map<string, { patient: Patient; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  public readonly PAGE_SIZE = 25;

  constructor(private db: Firestore) {
    this.patientsCollection = collection(this.db, 'patients');
  }

  private generateUniqueId(familyId: string, userId: string, name?: string, phone?: string): string {
    if (name && phone) {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0].toLowerCase();
      const lastName = nameParts[nameParts.length - 1].toLowerCase();
      const cleanPhone = phone.trim();
      return `${firstName}_${lastName}_${cleanPhone}_${userId}`;
    }
    return `${familyId}_${userId}`;
  }

  generateFamilyId(name: string, phone: string): string {
    const nameParts = name.trim().split(' ');
    const cleanPhone = phone.trim();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    return `${lastName}_${cleanPhone}`;
  }

  async addPatient(
    patientData: Omit<Patient, 'uniqueId' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<string> {
    try {
      const uniqueId = this.generateUniqueId(patientData.familyId, userId, patientData.name, patientData.phone);
      const patientDoc = doc(this.patientsCollection, uniqueId);

      const patient: Patient = {
        ...patientData,
        uniqueId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const patientWithSearch = { ...patient, nameLower: patient.name.toLowerCase() };
      const cleanedPatient = this.removeUndefinedFields(patientWithSearch);
      await setDoc(patientDoc, this.convertToFirestore(cleanedPatient));
      this.addToCache(uniqueId, patient);
      return uniqueId;
    } catch (error) {
      console.error('Error adding patient:', error);
      throw error;
    }
  }

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
   * Search by phone number — paginated
   */
  async searchPatientByPhone(
    phone: string,
    userId: string,
    lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
  ): Promise<PagedResult> {
    try {
      const searchTerm = phone.trim();
      const constraints: any[] = [
        where('userId', '==', userId),
        where('phone', '>=', searchTerm),
        where('phone', '<=', searchTerm + '\uf8ff'),
        orderBy('phone'),
        orderBy('createdAt', 'desc'),
        limit(this.PAGE_SIZE + 1)
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snapshot = await getDocs(query(this.patientsCollection, ...constraints));
      const hasMore = snapshot.docs.length > this.PAGE_SIZE;
      const docs = hasMore ? snapshot.docs.slice(0, this.PAGE_SIZE) : snapshot.docs;
      const results = docs.map(d => this.convertFromFirestore(d.data()));
      results.forEach(p => this.addToCache(p.uniqueId, p));

      console.log(`Phone search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastDoc: docs[docs.length - 1] ?? null, hasMore };
    } catch (error) {
      console.error('Error searching patient by phone:', error);
      throw error;
    }
  }

  /**
   * Search by name prefix — paginated, silent fallback if index missing
   */
  async searchPatientByName(
    name: string,
    userId: string,
    lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
  ): Promise<PagedResult> {
    try {
      const searchTerm = name.toLowerCase().trim();
      const constraints: any[] = [
        where('userId', '==', userId),
        where('nameLower', '>=', searchTerm),
        where('nameLower', '<=', searchTerm + '\uf8ff'),
        orderBy('nameLower'),
        orderBy('createdAt', 'desc'),
        limit(this.PAGE_SIZE + 1)
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snapshot = await getDocs(query(this.patientsCollection, ...constraints));
      const hasMore = snapshot.docs.length > this.PAGE_SIZE;
      const docs = hasMore ? snapshot.docs.slice(0, this.PAGE_SIZE) : snapshot.docs;
      const results = docs.map(d => this.convertFromFirestore(d.data()));
      results.forEach(p => this.addToCache(p.uniqueId, p));

      console.log(`Name search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastDoc: docs[docs.length - 1] ?? null, hasMore };
    } catch (error: any) {
      console.warn('Name search unavailable (index pending):', error?.message);
      return { results: [], lastDoc: null, hasMore: false };
    }
  }

  /**
   * Search by family ID — paginated
   */
  async searchPatientByFamilyId(
    familyId: string,
    userId: string,
    lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
  ): Promise<PagedResult> {
    try {
      const searchTerm = familyId.toLowerCase().trim();
      const constraints: any[] = [
        where('userId', '==', userId),
        where('familyId', '>=', searchTerm),
        where('familyId', '<=', searchTerm + '\uf8ff'),
        orderBy('familyId'),
        orderBy('createdAt', 'desc'),
        limit(this.PAGE_SIZE + 1)
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snapshot = await getDocs(query(this.patientsCollection, ...constraints));
      const hasMore = snapshot.docs.length > this.PAGE_SIZE;
      const docs = hasMore ? snapshot.docs.slice(0, this.PAGE_SIZE) : snapshot.docs;
      const results = docs.map(d => this.convertFromFirestore(d.data()));
      results.forEach(p => this.addToCache(p.uniqueId, p));

      console.log(`FamilyId search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastDoc: docs[docs.length - 1] ?? null, hasMore };
    } catch (error) {
      console.error('Error searching patient by family ID:', error);
      throw error;
    }
  }

  async getPatientById(uniqueId: string, userId: string): Promise<Patient | null> {
    try {
      const cached = this.getFromCache(uniqueId);
      if (cached && cached.userId === userId) return cached;

      const patientDoc = doc(this.patientsCollection, uniqueId);
      const docSnap = await getDoc(patientDoc);

      if (docSnap.exists()) {
        const patient = this.convertFromFirestore(docSnap.data());
        if (patient.userId !== userId) return null;
        this.addToCache(uniqueId, patient);
        return patient;
      }
      return null;
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  async updatePatient(uniqueId: string, patientData: Partial<Patient>, userId: string): Promise<void> {
    try {
      const existingPatient = await this.getPatientById(uniqueId, userId);
      if (!existingPatient) throw new Error('Patient not found or unauthorized');

      const patientDoc = doc(this.patientsCollection, uniqueId);
      const { createdAt, uniqueId: _, userId: __, ...dataWithoutProtectedFields } = patientData as any;

      const updateData: any = { ...dataWithoutProtectedFields, updatedAt: new Date() };
      if (dataWithoutProtectedFields.name) {
        updateData.nameLower = dataWithoutProtectedFields.name.toLowerCase();
      }

      const cleanedUpdate = this.removeUndefinedFields(updateData);
      await updateDoc(patientDoc, this.convertToFirestore(cleanedUpdate));
      this.removeFromCache(uniqueId);
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  async addVisit(
    patientId: string,
    visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<string> {
    try {
      const patient = await this.getPatientById(patientId, userId);
      if (!patient) throw new Error('Patient not found or unauthorized');

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

  async getPatientVisits(patientId: string, userId: string): Promise<Visit[]> {
    try {
      const patient = await this.getPatientById(patientId, userId);
      if (!patient) throw new Error('Patient not found or unauthorized');

      const patientDoc = doc(this.patientsCollection, patientId);
      const visitsCollection = collection(patientDoc, 'visits');
      const q = query(visitsCollection, orderBy('createdAt', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(d => this.convertFromFirestore(d.data()) as Visit);
    } catch (error) {
      console.error('Error getting visits:', error);
      throw error;
    }
  }

  private addToCache(uniqueId: string, patient: Patient): void {
    this.patientCache.set(uniqueId, { patient, timestamp: Date.now() });
  }

  private getFromCache(uniqueId: string): Patient | null {
    const cached = this.patientCache.get(uniqueId);
    if (!cached) return null;
    const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;
    if (isExpired) { this.patientCache.delete(uniqueId); return null; }
    return cached.patient;
  }

  private removeFromCache(uniqueId: string): void {
    this.patientCache.delete(uniqueId);
  }

  public clearCache(): void {
    this.patientCache.clear();
  }

  private convertToFirestore(data: any): any {
    const converted: any = {};
    for (const key in data) {
      const value = data[key];
      if (value === undefined) continue;
      converted[key] = value instanceof Date ? Timestamp.fromDate(value) : value;
    }
    return converted;
  }

  async deleteVisit(patientId: string, visitId: string, userId: string): Promise<void> {
    const patientDoc = doc(this.patientsCollection, patientId);
    const visitDoc = doc(collection(patientDoc, 'visits'), visitId);
    await deleteDoc(visitDoc);
  }

  async deletePatient(uniqueId: string, userId: string): Promise<void> {
    // Delete all visits first
    const patientDoc = doc(this.patientsCollection, uniqueId);
    const visitsCollection = collection(patientDoc, 'visits');
    const visitsSnapshot = await getDocs(query(visitsCollection, where('userId', '==', userId)));
    const deletePromises = visitsSnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    // Delete patient document
    await deleteDoc(patientDoc);
    this.patientCache.delete(uniqueId);
  }

  private convertFromFirestore(data: any): any {
    const converted: any = {};
    for (const key in data) {
      converted[key] = (data[key] && typeof data[key].toDate === 'function')
        ? data[key].toDate()
        : data[key];
    }
    return converted;
  }
}