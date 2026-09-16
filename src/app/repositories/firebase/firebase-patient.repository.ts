// src/app/repositories/firebase/firebase-patient.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR PATIENT/VISIT DATA.
// All components and services must inject PatientRepository (the abstract class).
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { ClinicContextService } from '../../services/clinicContextService';
import { PatientRepository, PagedResult } from '../interfaces/patient.repository';
import { Patient, Visit } from '../../models/patient.model';

@Injectable()
export class FirebasePatientRepository extends PatientRepository {
  private api = inject(FirestoreApiService);
  private clinicContext = inject(ClinicContextService);

  private patientCache: Map<string, { patient: Patient; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  override readonly PAGE_SIZE = 25;

  private getSubscriptionId(): string {
    return this.clinicContext.requireSubscriptionId();
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

  // ── Patient CRUD ──────────────────────────────────────────

  async addPatient(patientData: Omit<Patient, 'id' | 'last_updated'>): Promise<string> {
    try {
      const now = new Date().toISOString();
      const subId = this.getSubscriptionId();
      // Use subscription-scoped ID generation so pat_1, pat_2 … are
      // independent per tenant and do not reveal cross-tenant counts.
      const id = await this.api.getNextSequentialIdForSubscription('pat', 'patients', subId);

      const patient: Omit<Patient, 'id'> & { nameLower: string; last_updated: string } = {
        ...patientData,
        subscription_id: patientData.subscription_id || subId,
        clinic_ids: patientData.clinic_ids ?? [],
        created_at: patientData.created_at || now,
        last_updated: now,
        nameLower: patientData.name.toLowerCase()
      };

      const cleanedPatient = this.removeUndefinedFields(patient);
      await this.api.setDocument('patients', id, cleanedPatient);
      this.addToCache(id, { ...patientData, id } as Patient);
      return id;
    } catch (error) {
      console.error('Error adding patient:', error);
      throw error;
    }
  }

  async searchPatientByPhone(
    phone: string,
    lastCursor: any = null,
    clinicId?: string
  ): Promise<PagedResult> {
    try {
      const subId = this.getSubscriptionId();
      const searchTerm = phone.trim();
      const filters: any[] = [
        { field: 'subscription_id', op: '==', value: subId },
        { field: 'phone', op: '>=', value: searchTerm },
        { field: 'phone', op: '<=', value: searchTerm + '\uf8ff' },
      ];
      if (clinicId) {
        filters.push({ field: 'clinic_ids', op: 'array-contains', value: clinicId });
      }

      const startAfterValues = lastCursor ? [lastCursor] : undefined;

      const docs = await this.api.runQuery('', {
        collectionId: 'patients',
        filters,
        orderBy: [{ field: 'phone', direction: 'ASCENDING' }],
        limit: this.PAGE_SIZE + 1,
        startAfterValues,
      });

      const hasMore = docs.length > this.PAGE_SIZE;
      const resultDocs = hasMore ? docs.slice(0, this.PAGE_SIZE) : docs;
      const results = resultDocs.map(d => ({ ...d.data, id: d.id } as Patient));
      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });

      const newCursor = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1].data.phone : null;
      return { results, lastCursor: newCursor, hasMore };
    } catch (error: any) {
      if (error?.status !== 400 && error?.status !== 404) {
        console.warn('Phone search unavailable:', error?.message || error);
      }
      return { results: [], lastCursor: null, hasMore: false };
    }
  }

  async searchPatientByName(
    name: string,
    lastCursor: any = null,
    clinicId?: string
  ): Promise<PagedResult> {
    try {
      const subId = this.getSubscriptionId();
      const searchTerm = name.toLowerCase().trim();
      const filters: any[] = [
        { field: 'subscription_id', op: '==', value: subId },
        { field: 'nameLower', op: '>=', value: searchTerm },
        { field: 'nameLower', op: '<=', value: searchTerm + '\uf8ff' },
      ];
      if (clinicId) {
        filters.push({ field: 'clinic_ids', op: 'array-contains', value: clinicId });
      }

      const startAfterValues = lastCursor ? [lastCursor] : undefined;

      const docs = await this.api.runQuery('', {
        collectionId: 'patients',
        filters,
        orderBy: [{ field: 'nameLower', direction: 'ASCENDING' }],
        limit: this.PAGE_SIZE + 1,
        startAfterValues,
      });

      const hasMore = docs.length > this.PAGE_SIZE;
      const resultDocs = hasMore ? docs.slice(0, this.PAGE_SIZE) : docs;
      const results = resultDocs.map(d => ({ ...d.data, id: d.id } as Patient));
      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });

      const newCursor = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1].data.nameLower : null;
      return { results, lastCursor: newCursor, hasMore };
    } catch {
      return { results: [], lastCursor: null, hasMore: false };
    }
  }

  async searchPatientsContaining(term: string, clinicId?: string): Promise<PagedResult> {
    try {
      const subId = this.getSubscriptionId();
      const lowerTerm = term.toLowerCase().trim();
      const filters: any[] = [{ field: 'subscription_id', op: '==', value: subId }];
      if (clinicId) {
        filters.push({ field: 'clinic_ids', op: 'array-contains', value: clinicId });
      }

      const docs = await this.api.runQuery('', { collectionId: 'patients', filters, limit: 500 });

      const allPatients = docs.map(d => ({ ...d.data, id: d.id } as Patient));
      const results = allPatients.filter((p: Patient) => {
        const nameMatch = p.name && p.name.toLowerCase().includes(lowerTerm);
        const phoneMatch = p.phone && p.phone.toString().includes(lowerTerm);
        const idMatch = p.id && p.id.toLowerCase().includes(lowerTerm);
        return nameMatch || phoneMatch || idMatch;
      });

      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });
      return { results, lastCursor: null, hasMore: false };
    } catch (error) {
      console.error('Error in contains search:', error);
      return { results: [], lastCursor: null, hasMore: false };
    }
  }

  async getPatientById(patientId: string): Promise<Patient | null> {
    try {
      const cached = this.getFromCache(patientId);
      if (cached) {
        // Verify cached patient belongs to current subscription
        const subId = this.getSubscriptionId();
        if (cached.subscription_id && cached.subscription_id !== subId) {
          return null;
        }
        return cached;
      }

      const result = await this.api.getDocument('patients', patientId);
      if (result) {
        // ── Tenant isolation check ──────────────────────────────────────────
        // Verify the fetched document belongs to the current user's subscription.
        // Without this, any user knowing a patient ID can read another tenant's data.
        const subId = this.getSubscriptionId();
        if (result.data.subscription_id && result.data.subscription_id !== subId) {
          console.warn('[PatientRepo] getPatientById: cross-tenant access blocked.',
            'Requested:', patientId,
            '| doc.subscription_id:', result.data.subscription_id,
            '| current subId:', subId);
          return null;
        }
        const patient = { ...result.data, id: patientId } as Patient;
        this.addToCache(patientId, patient);
        return patient;
      }
      return null;
    } catch (error: any) {
      if (error?.status === 404) return null;
      console.warn('Error getting patient:', error?.message || error);
      return null;
    }
  }

  async updatePatient(patientId: string, patientData: Partial<Patient>): Promise<void> {
    try {
      const { id: _, ...dataWithoutId } = patientData as any;
      const updateData: any = { ...dataWithoutId, last_updated: new Date().toISOString() };
      if (dataWithoutId.name) {
        updateData.nameLower = dataWithoutId.name.toLowerCase();
      }
      const cleanedUpdate = this.removeUndefinedFields(updateData);
      await this.api.updateDocument('patients', patientId, cleanedUpdate);
      this.removeFromCache(patientId);
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  async deletePatient(patientId: string): Promise<void> {
    const subId = this.getSubscriptionId();

    // ── Tenant ownership check ─────────────────────────────────────────────
    // Fetch the patient first and verify it belongs to the current subscription
    // before deleting. Prevents cross-tenant deletions via direct document ID.
    const existing = await this.api.getDocument('patients', patientId);
    if (!existing) throw new Error(`Patient ${patientId} not found.`);
    if (existing.data.subscription_id && existing.data.subscription_id !== subId) {
      console.error('[PatientRepo] deletePatient: cross-tenant delete blocked.',
        'patientId:', patientId,
        '| doc.subscription_id:', existing.data.subscription_id,
        '| current subId:', subId);
      throw new Error('Access denied: patient does not belong to your subscription.');
    }

    const visitDocs = await this.api.runQuery('', {
      collectionId: 'visits',
      filters: [
        { field: 'subscription_id', op: '==', value: subId },
        { field: 'patient_id', op: '==', value: patientId },
      ],
    });
    await Promise.all(visitDocs.map(d => this.api.deleteDocument('visits', d.id)));
    await this.api.deleteDocument('patients', patientId);
    this.patientCache.delete(patientId);
  }

  async getPatientCount(subscriptionId: string, clinicId?: string | null): Promise<number> {
    const filters: any[] = [{ field: 'subscription_id', op: '==', value: subscriptionId }];
    if (clinicId) {
      filters.push({ field: 'clinic_ids', op: 'array-contains', value: clinicId });
    }
    return this.api.runCount('', { collectionId: 'patients', filters });
  }

  // ── Visits ──────────────────────────────────────────────────

  async addVisit(visitData: Omit<Visit, 'id' | 'created_at'>): Promise<string> {
    try {
      const subId = this.getSubscriptionId();
      // Use subscription-scoped ID so visit sequences are per-tenant.
      const id = await this.api.getNextSequentialIdForSubscription('vst', 'visits', subId);
      const visit: Visit = {
        ...visitData,
        id,
        subscription_id: visitData.subscription_id || subId,
        clinic_id: visitData.clinic_id || this.clinicContext.getSelectedClinicId() || '',
        created_at: new Date().toISOString()
      };
      await this.api.setDocument('visits', id, visit);
      return id;
    } catch (error) {
      console.error('Error adding visit:', error);
      throw error;
    }
  }

  async getPatientVisits(patientId: string, clinicId?: string): Promise<Visit[]> {
    try {
      const subId = this.getSubscriptionId();
      const filters: any[] = [
        { field: 'subscription_id', op: '==', value: subId },
        { field: 'patient_id', op: '==', value: patientId },
      ];
      // When a clinic ID is supplied, scope visits to that clinic only.
      // This ensures each clinic sees only its own visits even when
      // share_patients_across_clinics is enabled at the subscription level.
      if (clinicId) {
        filters.push({ field: 'clinic_id', op: '==', value: clinicId });
      }
      const docs = await this.api.runQuery('', {
        collectionId: 'visits',
        filters,
      });
      const visits = docs.map(d => d.data as Visit);
      visits.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
      return visits;
    } catch (error) {
      console.error('Error getting visits:', error);
      throw error;
    }
  }

  async updateVisit(visitId: string, visitData: Partial<Visit>): Promise<void> {
    try {
      const { id: _, ...dataWithoutId } = visitData as any;
      const cleanedUpdate = this.removeUndefinedFields(dataWithoutId);
      await this.api.updateDocument('visits', visitId, cleanedUpdate);
    } catch (error) {
      console.error('Error updating visit:', error);
      throw error;
    }
  }

  async deleteVisit(visitId: string): Promise<void> {
    // ── Tenant ownership check ─────────────────────────────────────────────
    // Fetch the visit first and verify it belongs to the current subscription
    // before deleting. Prevents cross-tenant deletions via direct visit ID.
    const subId = this.getSubscriptionId();
    const existing = await this.api.getDocument('visits', visitId);
    if (existing && existing.data.subscription_id && existing.data.subscription_id !== subId) {
      console.error('[PatientRepo] deleteVisit: cross-tenant delete blocked.',
        'visitId:', visitId,
        '| doc.subscription_id:', existing.data.subscription_id,
        '| current subId:', subId);
      throw new Error('Access denied: visit does not belong to your subscription.');
    }
    await this.api.deleteDocument('visits', visitId);
  }

  // ── Cache ─────────────────────────────────────────────────

  private addToCache(id: string, patient: Patient): void {
    this.patientCache.set(id, { patient, timestamp: Date.now() });
  }

  private getFromCache(id: string): Patient | null {
    const cached = this.patientCache.get(id);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.patientCache.delete(id);
      return null;
    }
    return cached.patient;
  }

  private removeFromCache(id: string): void {
    this.patientCache.delete(id);
  }

  clearCache(): void {
    this.patientCache.clear();
  }
}

