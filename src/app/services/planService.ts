// src/app/services/planService.ts
import { Injectable, inject } from '@angular/core';
import { PlanRepository } from '../repositories/interfaces/plan.repository';
import { ConfigService } from './configService';
import { PlanDetail } from '../models/subscription.model';

/**
 * PlanService — orchestration over PlanRepository.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private planRepo = inject(PlanRepository);
  private configService = inject(ConfigService);

  async getPlans(): Promise<PlanDetail[]> {
    // Enrich plans with system-config validity_days if needed
    const plans = await this.planRepo.listPlans();
    // If validity_days is still 0 (fallback), try system config
    const systemConfig = await this.configService.getSystemConfig().catch(() => ({} as any));
    return plans.map(p => {
      if (p.validity_days > 0) return p;
      const sysKey = `${p.key}_plan_validity_days`;
      const sysVal = Number(systemConfig[sysKey] || 0);
      return { ...p, validity_days: sysVal > 0 ? sysVal : 30 };
    });
  }

  async getPlanByKey(key: string): Promise<PlanDetail | null> {
    return this.planRepo.getPlanByKey(key);
  }

  async savePlan(key: string, data: Omit<PlanDetail, 'key'>): Promise<void> {
    return this.planRepo.savePlan(key, data);
  }

  async deletePlan(key: string): Promise<void> {
    return this.planRepo.deletePlan(key);
  }

  invalidateCache(): void {
    this.planRepo.invalidateCache();
  }

  getTotalCharge(plan: PlanDetail, cycle: 'monthly' | 'quarterly' | 'yearly'): number {
    switch (cycle) {
      case 'quarterly': return plan.quarterly_charges * 3;
      case 'yearly':    return plan.yearly_charges * 12;
      default:          return plan.monthly_charges;
    }
  }

  getSavingsPercent(plan: PlanDetail, cycle: 'monthly' | 'quarterly' | 'yearly'): number {
    if (cycle === 'monthly') return 0;
    const monthlyTotal = plan.monthly_charges * (cycle === 'quarterly' ? 3 : 12);
    const actualTotal = this.getTotalCharge(plan, cycle);
    if (monthlyTotal === 0) return 0;
    return Math.round(((monthlyTotal - actualTotal) / monthlyTotal) * 100);
  }
}
