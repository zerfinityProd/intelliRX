// src/app/services/clinicService.ts
import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  CollectionReference,
  DocumentData
} from '@angular/fire/firestore';
import { ClinicContextService } from './clinicContextService';
import { Clinic, ClinicSchedule } from '../models/clinic.model';

@Injectable({ providedIn: 'root' })
export class ClinicService {

  /** In-memory cache: clinicId → Clinic */
  private cache = new Map<string, { clinic: Clinic; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(
    private db: Firestore,
    private clinicContext: ClinicContextService
  ) {}

  // ─── Collection reference ───

  private getClinicsCollection(): CollectionReference<DocumentData> {
    return collection(this.db, 'clinics');
  }

  private getSubscriptionId(): string {
    return this.clinicContext.requireSubscriptionId();
  }

  // ─── Schedule subcollection helper ───

  /**
   * Fetch schedule data from the `clinics/{clinicId}/schedule` subcollection.
   * Returns the first schedule document's data, or a default empty schedule.
   *
   * Firestore structure:
   *   clinics/{clinicId}/schedule/{scheduleDocId}
   *     → { weekdays: ["M","T","W","Th","F"], timings: [{label,start,end},...] }
   */
  private async fetchScheduleSubcollection(clinicId: string): Promise<ClinicSchedule> {
    const defaultSchedule: ClinicSchedule = { weekdays: [], timings: [] };
    try {
      const scheduleCol = collection(this.db, 'clinics', clinicId, 'schedule');
      const snap = await getDocs(scheduleCol);
      if (snap.empty) return defaultSchedule;

      // Use the first schedule document
      const data = snap.docs[0].data();
      const weekdays: string[] = Array.isArray(data['weekdays']) ? data['weekdays'] : [];
      const rawTimings = Array.isArray(data['timings']) ? data['timings'] : [];
      const timings = rawTimings.map((t: any) => ({
        label: t['label'] || '',
        start: t['start'] || '',
        end: t['end'] || ''
      }));

      console.log(`📅 Schedule loaded for clinic ${clinicId}: weekdays=${JSON.stringify(weekdays)}, timings=${timings.length} block(s)`);
      return { weekdays, timings };
    } catch (error) {
      console.warn('Error fetching schedule subcollection for clinic:', clinicId, error);
      return defaultSchedule;
    }
  }

  // ─── READ ───

  /**
   * Fetch all clinics for the current subscription.
   */
  async getClinics(): Promise<Clinic[]> {
    try {
      const clinicsCol = this.getClinicsCollection();
      const subId = this.getSubscriptionId();
      const q = query(clinicsCol, where('subscription_id', '==', subId));
      const snapshot = await getDocs(q);

      const clinics: Clinic[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();

        // Try document-level schedule field first, then fetch subcollection
        let schedule: ClinicSchedule = data['schedule'] || { weekdays: [], timings: [] };
        if (!schedule.weekdays?.length && !schedule.timings?.length) {
          schedule = await this.fetchScheduleSubcollection(d.id);
        }

        const clinic: Clinic = {
          id: d.id,
          subscription_id: data['subscription_id'] || subId,
          name: data['name'] || '',
          address: data['address'],
          phone: data['phone'],
          email: data['email'],
          schedule,
          doctor_ids: data['doctor_ids'] || [],
          created_at: data['created_at'],
          updated_at: data['updated_at']
        };
        this.addToCache(clinic);
        clinics.push(clinic);
      }

      console.log(`Loaded ${clinics.length} clinic(s) for subscription ${subId}`);
      return clinics;
    } catch (error) {
      console.error('Error fetching clinics:', error);
      throw error;
    }
  }

  /**
   * Fetch a single clinic by ID.
   * Returns from cache if available.
   */
  async getClinicById(clinicId: string): Promise<Clinic | null> {
    // Check cache first
    const cached = this.getFromCache(clinicId);
    if (cached) return cached;

    try {
      const clinicDoc = doc(this.getClinicsCollection(), clinicId);
      const snap = await getDoc(clinicDoc);
      if (!snap.exists()) return null;

      const data = snap.data();

      // Try document-level schedule field first, then fetch subcollection
      let schedule: ClinicSchedule = data['schedule'] || { weekdays: [], timings: [] };
      if (!schedule.weekdays?.length && !schedule.timings?.length) {
        schedule = await this.fetchScheduleSubcollection(clinicId);
      }

      const clinic: Clinic = {
        id: snap.id,
        subscription_id: data['subscription_id'] || '',
        name: data['name'] || '',
        address: data['address'],
        phone: data['phone'],
        email: data['email'],
        schedule,
        doctor_ids: data['doctor_ids'] || [],
        created_at: data['created_at'],
        updated_at: data['updated_at']
      };
      this.addToCache(clinic);
      return clinic;
    } catch (error) {
      console.error('Error fetching clinic by ID:', error);
      throw error;
    }
  }

  /**
   * Get clinic name by ID (for denormalization).
   * Returns the cached name or fetches from Firestore.
   */
  async getClinicName(clinicId: string): Promise<string> {
    const clinic = await this.getClinicById(clinicId);
    return clinic?.name || clinicId;
  }

  // ─── CREATE ───

  /**
   * Create a new clinic within the current subscription.
   */
  async createClinic(
    clinicData: Omit<Clinic, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    try {
      const clinicsCol = this.getClinicsCollection();
      const clinicDoc = doc(clinicsCol);
      const id = clinicDoc.id;
      const now = new Date().toISOString();

      const clinic: Clinic = {
        ...clinicData,
        id,
        subscription_id: clinicData.subscription_id || this.getSubscriptionId(),
        created_at: now,
        updated_at: now
      };

      await setDoc(clinicDoc, this.removeUndefined(clinic));
      this.addToCache(clinic);
      console.log('✓ Clinic created:', id);
      return id;
    } catch (error) {
      console.error('Error creating clinic:', error);
      throw error;
    }
  }

  // ─── UPDATE ───

  /**
   * Update an existing clinic's data.
   */
  async updateClinic(clinicId: string, updates: Partial<Clinic>): Promise<void> {
    try {
      const clinicDoc = doc(this.getClinicsCollection(), clinicId);
      const { id: _, ...dataWithoutId } = updates as any;
      const updatePayload = {
        ...dataWithoutId,
        updated_at: new Date().toISOString()
      };
      await updateDoc(clinicDoc, this.removeUndefined(updatePayload));
      this.removeFromCache(clinicId);
      console.log('✓ Clinic updated:', clinicId);
    } catch (error) {
      console.error('Error updating clinic:', error);
      throw error;
    }
  }

  // ─── CACHE ───

  private addToCache(clinic: Clinic): void {
    if (clinic.id) {
      this.cache.set(clinic.id, { clinic, timestamp: Date.now() });
    }
  }

  private getFromCache(clinicId: string): Clinic | null {
    const cached = this.cache.get(clinicId);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(clinicId);
      return null;
    }
    return cached.clinic;
  }

  private removeFromCache(clinicId: string): void {
    this.cache.delete(clinicId);
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  // ─── UTIL ───

  private removeUndefined(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = obj[key];
      }
    }
    return cleaned;
  }
}
