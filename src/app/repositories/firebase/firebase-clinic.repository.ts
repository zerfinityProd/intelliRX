// src/app/repositories/firebase/firebase-clinic.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR CLINIC DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { ClinicContextService } from '../../services/clinicContextService';
import { ClinicRepository } from '../interfaces/clinic.repository';
import { Clinic, ClinicSchedule } from '../../models/clinic.model';

@Injectable()
export class FirebaseClinicRepository extends ClinicRepository {
  private api = inject(FirestoreApiService);
  private clinicContext = inject(ClinicContextService);

  private cache = new Map<string, { clinic: Clinic; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000;

  private getSubscriptionId(): string {
    return this.clinicContext.requireSubscriptionId();
  }

  private removeUndefined(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) cleaned[key] = obj[key];
    }
    return cleaned;
  }

  private async fetchScheduleSubcollection(clinicId: string): Promise<ClinicSchedule> {
    const defaultSchedule: ClinicSchedule = { weekdays: [], timings: [] };
    try {
      const result = await this.api.getDocument(`clinics/${clinicId}/schedule`, 'schedule');
      if (!result) return defaultSchedule;
      const data = result.data;
      const weekdays: string[] = Array.isArray(data['weekdays']) ? data['weekdays'] : [];
      const rawTimings = Array.isArray(data['timings']) ? data['timings'] : [];
      const timings = rawTimings.map((t: any) => ({
        label: t['label'] || '',
        start: t['start'] || '',
        end: t['end'] || ''
      }));
      return { weekdays, timings };
    } catch {
      return defaultSchedule;
    }
  }

  private async transformToClinic(data: any, id: string, subId: string): Promise<Clinic> {
    let schedule: ClinicSchedule = data['schedule'] || { weekdays: [], timings: [] };
    if (!schedule.weekdays?.length && !schedule.timings?.length) {
      schedule = await this.fetchScheduleSubcollection(id);
    }
    return {
      id,
      subscription_id: data['subscription_id'] || subId,
      name: data['name'] || '',
      address: data['address'],
      phone: data['phone'],
      email: data['email'],
      schedule,
      doctor_ids: data['doctor_ids'] || [],
      status: data['status'] || 'active',
      created_at: data['created_at'],
      updated_at: data['updated_at']
    };
  }

  async getClinics(subscriptionId: string): Promise<Clinic[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinics',
      filters: [{ field: 'subscription_id', op: '==', value: subscriptionId }],
    });
    const clinics: Clinic[] = [];
    for (const d of docs) {
      const clinic = await this.transformToClinic(d.data, d.id, subscriptionId);
      this.addToCache(clinic);
      clinics.push(clinic);
    }
    return clinics;
  }

  async getClinicById(clinicId: string): Promise<Clinic | null> {
    const cached = this.getFromCache(clinicId);
    if (cached) return cached;
    try {
      const result = await this.api.getDocument('clinics', clinicId);
      if (!result) return null;
      const clinic = await this.transformToClinic(result.data, result.id, '');
      this.addToCache(clinic);
      return clinic;
    } catch (error) {
      console.error('Error fetching clinic by ID:', error);
      throw error;
    }
  }

  async getClinicName(clinicId: string): Promise<string> {
    const clinic = await this.getClinicById(clinicId);
    return clinic?.name || clinicId;
  }

  async getClinicSummary(clinicId: string): Promise<{ name: string; address?: string } | null> {
    try {
      const result = await this.api.getDocument('clinics', clinicId);
      if (!result) return null;
      return {
        name: result.data['name'] || clinicId,
        address: result.data['address']
      };
    } catch {
      return null;
    }
  }

  async createClinic(clinicData: Omit<Clinic, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    const id = await this.api.getNextSequentialId('cln');
    const now = new Date().toISOString();
    const { schedule, ...rest } = clinicData as any;
    await this.api.setDocument('clinics', id, this.removeUndefined({
      ...rest,
      id,
      subscription_id: clinicData.subscription_id || this.getSubscriptionId(),
      created_at: now,
      updated_at: now
    }));
    if (schedule) await this.setClinicSchedule(id, schedule);
    return id;
  }

  async updateClinic(clinicId: string, updates: Partial<Clinic>): Promise<void> {
    const { id: _, schedule, ...rest } = updates as any;
    if (Object.keys(rest).length > 0) {
      await this.api.updateDocument('clinics', clinicId, this.removeUndefined({
        ...rest,
        updated_at: new Date().toISOString()
      }));
    }
    if (schedule) await this.setClinicSchedule(clinicId, schedule);
    this.removeFromCache(clinicId);
  }

  async deleteClinic(clinicId: string): Promise<void> {
    await this.api.deleteDocument('clinics', clinicId);
    this.removeFromCache(clinicId);
  }

  async getClinicSchedule(clinicId: string): Promise<ClinicSchedule | null> {
    const result = await this.api.getDocument(`clinics/${clinicId}/schedule`, 'schedule');
    return result ? (result.data as ClinicSchedule) : null;
  }

  async setClinicSchedule(clinicId: string, schedule: ClinicSchedule): Promise<void> {
    await this.api.setDocument(`clinics/${clinicId}/schedule`, 'schedule', schedule);
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  async getNextClinicId(): Promise<string> {
    // Delegates to getNextSequentialId which lists ALL clinic documents and finds
    // the global max — so new clinics across any subscription get a unique ID.
    return this.api.getNextSequentialId('cln');
  }

  private addToCache(clinic: Clinic): void {
    if (clinic.id) this.cache.set(clinic.id, { clinic, timestamp: Date.now() });
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
}

