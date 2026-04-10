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
import { ClinicContextService } from './clinicContextService';

export interface PagedResult {
  results: Patient[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private patientCache: Map<string, { patient: Patient; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  public readonly PAGE_SIZE = 25;

  constructor(
    private db: Firestore,
    private clinicContext: ClinicContextService
  ) {}

  /**
   * Top-level patients collection.
   * All queries must filter by subscription_id.
   */
  private getPatientsCollection(): CollectionReference<DocumentData> {
    return collection(this.db, 'patients');
  }

  /**
   * Top-level visits collection.
   */
  private getVisitsCollection(): CollectionReference<DocumentData> {
    return collection(this.db, 'visits');
  }

  private getSubscriptionId(): string {
    return this.clinicContext.requireSubscriptionId();
  }

  async addPatient(
    patientData: Omit<Patient, 'id' | 'last_updated'>,
  ): Promise<string> {
    try {
      const patientsCol = this.getPatientsCollection();
      const patientDoc = doc(patientsCol);
      const id = patientDoc.id;
      const now = new Date().toISOString();

      const patient: Patient = {
        ...patientData,
        id,
        // Ensure subscription_id is always set
        subscription_id: patientData.subscription_id || this.getSubscriptionId(),
        // Ensure clinic_ids is always an array
        clinic_ids: patientData.clinic_ids ?? [],
        created_at: patientData.created_at || now,
        last_updated: now
      };

      const patientWithSearch = { ...patient, nameLower: patient.name.toLowerCase() };
      const cleanedPatient = this.removeUndefinedFields(patientWithSearch);
      await setDoc(patientDoc, this.convertToFirestore(cleanedPatient));
      this.addToCache(id, patient);
      return id;
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
    lastDoc: QueryDocumentSnapshot<DocumentData> | null = null,
    clinicId?: string
  ): Promise<PagedResult> {
    try {
      const patientsCol = this.getPatientsCollection();
      const subId = this.getSubscriptionId();
      const searchTerm = phone.trim();
      const constraints: any[] = [
        where('subscription_id', '==', subId),
        where('phone', '>=', searchTerm),
        where('phone', '<=', searchTerm + '\uf8ff'),
        orderBy('phone'),
        limit(this.PAGE_SIZE + 1)
      ];
      if (clinicId) {
        constraints.push(where('clinic_ids', 'array-contains', clinicId));
      }
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snapshot = await getDocs(query(patientsCol, ...constraints));
      const hasMore = snapshot.docs.length > this.PAGE_SIZE;
      const docs = hasMore ? snapshot.docs.slice(0, this.PAGE_SIZE) : snapshot.docs;
      const results = docs.map(d => this.convertFromFirestore(d.data()));
      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });

      console.log(`Phone search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastDoc: docs[docs.length - 1] ?? null, hasMore };
    } catch (error) {
      console.error('Error searching patient by phone:', error);
      throw error;
    }
  }

  /**
   * Search by name prefix — paginated
   */
  async searchPatientByName(
    name: string,
    lastDoc: QueryDocumentSnapshot<DocumentData> | null = null,
    clinicId?: string
  ): Promise<PagedResult> {
    try {
      const patientsCol = this.getPatientsCollection();
      const subId = this.getSubscriptionId();
      const searchTerm = name.toLowerCase().trim();
      const constraints: any[] = [
        where('subscription_id', '==', subId),
        where('nameLower', '>=', searchTerm),
        where('nameLower', '<=', searchTerm + '\uf8ff'),
        orderBy('nameLower'),
        limit(this.PAGE_SIZE + 1)
      ];
      if (clinicId) {
        constraints.push(where('clinic_ids', 'array-contains', clinicId));
      }
      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snapshot = await getDocs(query(patientsCol, ...constraints));
      const hasMore = snapshot.docs.length > this.PAGE_SIZE;
      const docs = hasMore ? snapshot.docs.slice(0, this.PAGE_SIZE) : snapshot.docs;
      const results = docs.map(d => this.convertFromFirestore(d.data()));
      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });

      console.log(`Name search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastDoc: docs[docs.length - 1] ?? null, hasMore };
    } catch (error: any) {
      console.warn('Name search unavailable (index pending):', error?.message);
      return { results: [], lastDoc: null, hasMore: false };
    }
  }

  /**
   * Fetch all patients within the subscription and filter client-side for "contains" matching
   */
  async searchPatientsContaining(
    term: string,
    clinicId?: string
  ): Promise<PagedResult> {
    try {
      const patientsCol = this.getPatientsCollection();
      const subId = this.getSubscriptionId();
      const lowerTerm = term.toLowerCase().trim();
      const queryConstraints: any[] = [
        where('subscription_id', '==', subId)
      ];
      if (clinicId) {
        queryConstraints.push(where('clinic_ids', 'array-contains', clinicId));
      }
      queryConstraints.push(limit(500));
      const snapshot = await getDocs(
        query(patientsCol, ...queryConstraints)
      );
      const allPatients = snapshot.docs.map(d => this.convertFromFirestore(d.data()));

      const results = allPatients.filter((p: Patient) => {
        const nameMatch = p.name && p.name.toLowerCase().includes(lowerTerm);
        const phoneMatch = p.phone && p.phone.toString().includes(lowerTerm);
        return nameMatch || phoneMatch;
      });

      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });
      console.log(`Contains search "${term}": ${results.length} result(s)`);
      return { results, lastDoc: null, hasMore: false };
    } catch (error) {
      console.error('Error in contains search:', error);
      return { results: [], lastDoc: null, hasMore: false };
    }
  }

  async getPatientById(patientId: string): Promise<Patient | null> {
    try {
      const cached = this.getFromCache(patientId);
      if (cached) return cached;

      const patientsCol = this.getPatientsCollection();
      const patientDoc = doc(patientsCol, patientId);
      const docSnap = await getDoc(patientDoc);

      if (docSnap.exists()) {
        const patient = this.convertFromFirestore(docSnap.data());
        this.addToCache(patientId, patient);
        return patient;
      }
      return null;
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  async updatePatient(patientId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      const patientsCol = this.getPatientsCollection();
      const patientDoc = doc(patientsCol, patientId);

      const { id: _, ...dataWithoutId } = patientData as any;

      const updateData: any = { ...dataWithoutId, last_updated: new Date().toISOString() };
      if (dataWithoutId.name) {
        updateData.nameLower = dataWithoutId.name.toLowerCase();
      }

      const cleanedUpdate = this.removeUndefinedFields(updateData);
      await updateDoc(patientDoc, this.convertToFirestore(cleanedUpdate));
      this.removeFromCache(patientId);
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  async addVisit(
    visitData: Omit<Visit, 'id' | 'created_at'>,
  ): Promise<string> {
    try {
      const visitsCol = this.getVisitsCollection();
      const visitDoc = doc(visitsCol);
      const id = visitDoc.id;

      const visit: Visit = {
        ...visitData,
        id,
        // Ensure subscription_id is always set
        subscription_id: visitData.subscription_id || this.getSubscriptionId(),
        // Ensure clinic_id is set from context if not provided
        clinic_id: visitData.clinic_id || this.clinicContext.getSelectedClinicId() || '',
        created_at: new Date().toISOString()
      };

      await setDoc(visitDoc, this.convertToFirestore(visit));
      return id;
    } catch (error) {
      console.error('Error adding visit:', error);
      throw error;
    }
  }

  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      const visitsCol = this.getVisitsCollection();
      const subId = this.getSubscriptionId();
      const q = query(
        visitsCol,
        where('subscription_id', '==', subId),
        where('patient_id', '==', patientId)
      );
      const querySnapshot = await getDocs(q);
      const visits = querySnapshot.docs.map(d => this.convertFromFirestore(d.data()) as Visit);
      // Sort client-side to avoid requiring a Firestore composite index
      visits.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // descending
      });
      return visits;
    } catch (error) {
      console.error('Error getting visits:', error);
      throw error;
    }
  }

  private addToCache(id: string, patient: Patient): void {
    this.patientCache.set(id, { patient, timestamp: Date.now() });
  }

  private getFromCache(id: string): Patient | null {
    const cached = this.patientCache.get(id);
    if (!cached) return null;
    const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;
    if (isExpired) { this.patientCache.delete(id); return null; }
    return cached.patient;
  }

  private removeFromCache(id: string): void {
    this.patientCache.delete(id);
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

  async deleteVisit(visitId: string): Promise<void> {
    const visitsCol = this.getVisitsCollection();
    const visitDoc = doc(visitsCol, visitId);
    await deleteDoc(visitDoc);
  }

  async deletePatient(patientId: string): Promise<void> {
    const patientsCol = this.getPatientsCollection();
    // Delete all visits for this patient first
    const visitsCol = this.getVisitsCollection();
    const subId = this.getSubscriptionId();
    const visitsQuery = query(
      visitsCol,
      where('subscription_id', '==', subId),
      where('patient_id', '==', patientId)
    );
    const visitsSnapshot = await getDocs(visitsQuery);
    const deletePromises = visitsSnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    // Delete patient document
    const patientDoc = doc(patientsCol, patientId);
    await deleteDoc(patientDoc);
    this.patientCache.delete(patientId);
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