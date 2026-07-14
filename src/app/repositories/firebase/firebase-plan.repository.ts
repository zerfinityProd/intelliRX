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
        .filter(d => d.id !== 'demo')
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

  invalidateCache(): void {
    this.cache = null;
  }
}

