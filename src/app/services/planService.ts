// src/app/services/planService.ts
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { PlanDetail } from '../models/subscription.model';
import { ConfigService } from './configService';

/** Cache entry with TTL tracking */
interface CacheEntry {
  data: PlanDetail[];
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class PlanService {
  private api = inject(FirestoreApiService);
  private configService = inject(ConfigService);

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cache: CacheEntry | null = null;

  /**
   * Fetch all plans from the `plans` Firestore collection.
   * Maps raw document data to strongly-typed PlanDetail objects.
   * Results are cached for 5 minutes.
   *
   * Only 'starter' and 'pro' plan documents are returned (demo is excluded).
   */
  async getPlans(): Promise<PlanDetail[]> {
    // Return cached data if still fresh
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL) {
      return [...this.cache.data];
    }

    try {
      // Fetch all documents from the 'plans' collection
      const docs = await this.api.listDocuments('plans', 50);

      // Fetch validity days from system config for each plan
      const systemConfig = await this.configService.getSystemConfig();

      const plans: PlanDetail[] = docs
        // Exclude the demo plan from the subscription management page
        .filter(d => d.id !== 'demo')
        .map(d => {
          const data = d.data;
          const key = d.id;

          // Resolve validity days:
          // 1. Plain 'validity_days' field directly on the plan doc (primary)
          // 2. Prefixed '<key>_validity_days' field on the plan doc (legacy)
          // 3. '<key>_plan_validity_days' in system config (legacy fallback)
          // 4. Hard fallback: 30 days
          const docValidityKey = `${key}_validity_days`;
          const sysValidityKey = `${key}_plan_validity_days`;
          const validityDays =
            Number(data['validity_days'] || 0) ||
            Number(data[docValidityKey] || 0) ||
            Number(systemConfig[sysValidityKey] || 0) ||
            30;

          return {
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            description: (data['description'] as string) || undefined,
            monthly_charges: Number(data['monthly_charges'] || 0),
            // Handle both 'quarterly_charges' (corrected) spellings
            quarterly_charges: Number(
              data['quarterly_charges'] ?? data['quaterly_charges'] ?? 0
            ),
            yearly_charges: Number(data['yearly_charges'] || 0),
            max_clinics: Number(data['max_clinics'] ?? data['max_clinincs'] ?? 0),
            max_doctors: Number(data['max_doctors'] || 0),
            max_receptionists: Number(
              data['max_receptionists'] ?? data['max_receptionist'] ?? 0
            ),
            max_patients: Number(data['max_patients'] || 0),
            validity_days: validityDays,
            features: Array.isArray(data['features']) ? data['features'] : undefined,
          } as PlanDetail;
        })
        // Sort by monthly price ascending (cheapest first)
        .sort((a, b) => a.monthly_charges - b.monthly_charges);

      this.cache = { data: plans, timestamp: Date.now() };
      return [...plans];
    } catch (err) {
      console.error('[PlanService] Failed to load plans:', err);
      return [];
    }
  }

  /** Fetch a single plan by its document key */
  async getPlanByKey(key: string): Promise<PlanDetail | null> {
    const plans = await this.getPlans();
    return plans.find(p => p.key === key) ?? null;
  }

  /** Invalidate the cache — call after a plan document is updated */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Compute the total amount charged for a billing cycle.
   * Monthly   → monthly_charges × 1
   * Quarterly → quarterly_charges × 3  (per-month price × 3 months)
   * Yearly    → yearly_charges × 12    (per-month price × 12 months)
   */
  getTotalCharge(
    plan: PlanDetail,
    cycle: 'monthly' | 'quarterly' | 'yearly'
  ): number {
    switch (cycle) {
      case 'quarterly': return plan.quarterly_charges * 3;
      case 'yearly':    return plan.yearly_charges * 12;
      default:          return plan.monthly_charges;
    }
  }

  /**
   * Compute savings percentage vs monthly billing.
   * Returns 0 if there's no savings.
   */
  getSavingsPercent(
    plan: PlanDetail,
    cycle: 'monthly' | 'quarterly' | 'yearly'
  ): number {
    if (cycle === 'monthly') return 0;
    const monthlyTotal = plan.monthly_charges * (cycle === 'quarterly' ? 3 : 12);
    const actualTotal = this.getTotalCharge(plan, cycle);
    if (monthlyTotal === 0) return 0;
    return Math.round(((monthlyTotal - actualTotal) / monthlyTotal) * 100);
  }
}
