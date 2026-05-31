import { Injectable, inject } from '@angular/core';
import { FirestoreApiService, DocumentResult } from './firestore-api.service';
import { Patient, Visit } from '../models/patient.model';
import { ClinicContextService } from './clinicContextService';

export interface PagedResult {
  results: Patient[];
  /** Opaque cursor for the next page (pass back to search methods) */
  lastCursor: any;
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PatientDataService {
  private api = inject(FirestoreApiService);
  private clinicContext = inject(ClinicContextService);

  private patientCache: Map<string, { patient: Patient; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  public readonly PAGE_SIZE = 25;

  private getSubscriptionId(): string {
    return this.clinicContext.requireSubscriptionId();
  }

  // ── Patient CRUD ──────────────────────────────────────────

  async addPatient(
    patientData: Omit<Patient, 'id' | 'last_updated'>,
  ): Promise<string> {
    try {
      const now = new Date().toISOString();
      const id = await this.generatePatientId();

      const patient: Omit<Patient, 'id'> & { nameLower: string; last_updated: string } = {
        ...patientData,
        subscription_id: patientData.subscription_id || this.getSubscriptionId(),
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

      const newCursor = resultDocs.length > 0
        ? resultDocs[resultDocs.length - 1].data.phone
        : null;

      console.log(`Phone search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastCursor: newCursor, hasMore };
    } catch (error: any) {
      // Gracefully handle query failures (e.g. missing index, permission errors)
      if (error?.status !== 400 && error?.status !== 404) {
        console.warn('Phone search unavailable:', error?.message || error);
      }
      return { results: [], lastCursor: null, hasMore: false };
    }
  }

  /**
   * Search by name prefix — paginated
   */
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

      const newCursor = resultDocs.length > 0
        ? resultDocs[resultDocs.length - 1].data.nameLower
        : null;

      console.log(`Name search: ${results.length} result(s), hasMore=${hasMore}`);
      return { results, lastCursor: newCursor, hasMore };
    } catch {
      // Index may be pending — silently fall back to contains search
      return { results: [], lastCursor: null, hasMore: false };
    }
  }

  /**
   * Fetch patients within the subscription and filter client-side for "contains" matching
   */
  async searchPatientsContaining(
    term: string,
    clinicId?: string
  ): Promise<PagedResult> {
    try {
      const subId = this.getSubscriptionId();
      const lowerTerm = term.toLowerCase().trim();
      const filters: any[] = [
        { field: 'subscription_id', op: '==', value: subId },
      ];
      if (clinicId) {
        filters.push({ field: 'clinic_ids', op: 'array-contains', value: clinicId });
      }

      const docs = await this.api.runQuery('', {
        collectionId: 'patients',
        filters,
        limit: 500,
      });

      const allPatients = docs.map(d => ({ ...d.data, id: d.id } as Patient));
      const results = allPatients.filter((p: Patient) => {
        const nameMatch = p.name && p.name.toLowerCase().includes(lowerTerm);
        const phoneMatch = p.phone && p.phone.toString().includes(lowerTerm);
        const idMatch = p.id && p.id.toLowerCase().includes(lowerTerm);
        return nameMatch || phoneMatch || idMatch;
      });

      results.forEach((p: Patient) => { if (p.id) this.addToCache(p.id, p); });
      console.log(`Contains search "${term}": ${results.length} result(s)`);
      return { results, lastCursor: null, hasMore: false };
    } catch (error) {
      console.error('Error in contains search:', error);
      return { results: [], lastCursor: null, hasMore: false };
    }
  }

  async getPatientById(patientId: string): Promise<Patient | null> {
    try {
      const cached = this.getFromCache(patientId);
      if (cached) return cached;

      const result = await this.api.getDocument('patients', patientId);
      if (result) {
        const patient = { ...result.data, id: patientId } as Patient;
        this.addToCache(patientId, patient);
        return patient;
      }
      return null;
    } catch (error: any) {
      // 404 is expected when searching by term that isn't a valid document ID
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

  // ── Visit CRUD ────────────────────────────────────────────

  async addVisit(
    visitData: Omit<Visit, 'id' | 'created_at'>,
  ): Promise<string> {
    try {
      const id = this.api.generateDocId();
      const visit: Visit = {
        ...visitData,
        id,
        subscription_id: visitData.subscription_id || this.getSubscriptionId(),
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

  async getPatientVisits(patientId: string): Promise<Visit[]> {
    try {
      const subId = this.getSubscriptionId();
      const docs = await this.api.runQuery('', {
        collectionId: 'visits',
        filters: [
          { field: 'subscription_id', op: '==', value: subId },
          { field: 'patient_id', op: '==', value: patientId },
        ],
      });
      const visits = docs.map(d => d.data as Visit);
      // Sort client-side to avoid requiring a composite index
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
    await this.api.deleteDocument('visits', visitId);
  }

  async deletePatient(patientId: string): Promise<void> {
    // Delete all visits for this patient first
    const subId = this.getSubscriptionId();
    const visitDocs = await this.api.runQuery('', {
      collectionId: 'visits',
      filters: [
        { field: 'subscription_id', op: '==', value: subId },
        { field: 'patient_id', op: '==', value: patientId },
      ],
    });
    const deletePromises = visitDocs.map(d => this.api.deleteDocument('visits', d.id));
    await Promise.all(deletePromises);
    // Delete patient document
    await this.api.deleteDocument('patients', patientId);
    this.patientCache.delete(patientId);
  }

  // ── Aggregation ───────────────────────────────────────────

  /**
   * Get the count of patients matching subscription (and optional clinic).
   * Replaces direct getCountFromServer usage in components.
   */
  async getPatientCount(subscriptionId: string, clinicId?: string | null): Promise<number> {
    const filters: any[] = [
      { field: 'subscription_id', op: '==', value: subscriptionId },
    ];
    if (clinicId) {
      filters.push({ field: 'clinic_ids', op: 'array-contains', value: clinicId });
    }
    return this.api.runCount('', { collectionId: 'patients', filters });
  }

  /**
   * Generate a sequential patient ID in the format YYYYMM#####
   * e.g. 20260500001, 20260500002, ...
   *
   * Queries existing patient documents to find the highest sequence number
   * for the current year-month prefix, then increments from there.
   * No external counter collection needed.
   */
  private async generatePatientId(maxRetries = 3): Promise<string> {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const currentPrefix = `${yyyy}${mm}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // List patient documents and find the highest ID matching the prefix.
        // We can still query by the 'id' field on legacy docs, but also check
        // document IDs directly for new docs that no longer store 'id' in data.
        const docs = await this.api.listDocuments('patients', 300);

        let maxSeq = 0;
        for (const doc of docs) {
          const docId = doc.id;
          if (docId.startsWith(currentPrefix)) {
            const seqPart = docId.substring(currentPrefix.length);
            const seq = parseInt(seqPart, 10);
            if (!isNaN(seq) && seq > maxSeq) {
              maxSeq = seq;
            }
          }
        }

        const nextSeq = maxSeq + 1;
        const patientId = `${currentPrefix}${String(nextSeq).padStart(5, '0')}`;

        // Verify no collision (race condition guard)
        const existing = await this.api.getDocument('patients', patientId);
        if (existing) {
          // Someone else used this ID concurrently — retry
          await new Promise(r => setTimeout(r, 100 + attempt * 150));
          continue;
        }

        return patientId;
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Fallback — should never reach here
    throw new Error('Failed to generate patient ID after retries');
  }

  // ── Cache ─────────────────────────────────────────────────

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
}