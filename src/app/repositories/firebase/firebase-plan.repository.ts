// src/app/repositories/firebase/firebase-plan.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR PLAN DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { PlanRepository } from '../interfaces/plan.repository';
import { PlanDetail } from '../../models/subscription.model';

interface CacheEntry {
  data: PlanDetail[];
  timestamp: number;
}

@Injectable()
export class FirebasePlanRepository extends PlanRepository {
  private api = inject(FirestoreApiService);

  private readonly CACHE_TTL = 5 * 60 * 1000;
  private cache: CacheEntry | null = null;

  async listPlans(): Promise<PlanDetail[]> {
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL) {
      return [...this.cache.data];
    }
    try {
      const docs = await this.api.listDocuments('plans', 50);
      const plans: PlanDetail[] = docs
        .map(d => {
          const data = d.data;
          const key = d.id;
          const docValidityKey = `${key}_validity_days`;
          const validityDays = Number(data['validity_days'] || 0) || Number(data[docValidityKey] || 0) || 30;
          return {
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            description: (data['description'] as string) || undefined,
            monthly_charges: Number(data['monthly_charges'] || 0),
            quarterly_charges: Number(data['quarterly_charges'] ?? data['quaterly_charges'] ?? 0),
            yearly_charges: Number(data['yearly_charges'] || 0),
            max_clinics: Number(data['max_clinics'] ?? data['max_clinincs'] ?? 0),
            max_doctors: Number(data['max_doctors'] || 0),
            max_receptionists: Number(data['max_receptionists'] ?? data['max_receptionist'] ?? 0),
            max_patients: Number(data['max_patients'] || 0),
            validity_days: validityDays,
            features: Array.isArray(data['features']) ? data['features'] : undefined,
            // plan_ending_nf: days before expiry when the notification window opens.
            // undefined (not 0) when absent — used by SubscriptionExpiryNotificationService
            // to distinguish demo plans (notify daily) from paid plans.
            plan_ending_nf: data['plan_ending_nf'] != null
              ? Number(data['plan_ending_nf'])
              : undefined,
          } as PlanDetail;
        })
        .sort((a, b) => a.monthly_charges - b.monthly_charges);

      this.cache = { data: plans, timestamp: Date.now() };
      return [...plans];
    } catch (err) {
      console.error('[FirebasePlanRepository] Failed to load plans:', err);
      return [];
    }
  }

  async getPlanByKey(key: string): Promise<PlanDetail | null> {
    const plans = await this.listPlans();
    return plans.find(p => p.key === key) ?? null;
  }

  async savePlan(key: string, data: Omit<PlanDetail, 'key'>): Promise<void> {
    await this.api.setDocument('plans', key, {
      label:               data.label || (key.charAt(0).toUpperCase() + key.slice(1)),
      description:         data.description ?? '',
      monthly_charges:     data.monthly_charges ?? 0,
      quarterly_charges:   data.quarterly_charges ?? 0,
      yearly_charges:      data.yearly_charges ?? 0,
      max_clinics:         data.max_clinics ?? 0,
      max_doctors:         data.max_doctors ?? 0,
      max_receptionists:   data.max_receptionists ?? 0,
      max_patients:        data.max_patients ?? 0,
      validity_days:       data.validity_days ?? 30,
      grace_period:        (data as any).grace_period ?? 0,
      plan_ending_nf:      data.plan_ending_nf ?? 7,
    });
    this.invalidateCache();
  }

  async deletePlan(key: string): Promise<void> {
    await this.api.deleteDocument('plans', key);
    this.invalidateCache();
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

