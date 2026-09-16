// src/app/services/configService.ts
import { Injectable, inject } from '@angular/core';
import { ConfigRepository } from '../repositories/interfaces/config.repository';
import { ClinicContextService } from './clinicContextService';
import {
  SystemSettings,
  SubscriptionConfig,
  ClinicConfig,
  DoctorConfig,
  resolveEffectiveSettings,
  DEFAULT_SYSTEM_SETTINGS
} from '../config/userSettings';
import { PlanOption, SystemConfig } from '../models/subscription.model';

/**
 * ConfigService — orchestration layer over ConfigRepository.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {

  private configRepo = inject(ConfigRepository);
  private clinicContext = inject(ClinicContextService);

  // ─── Subscription Config ──────────────────────────────────────────────────

  async getSubscriptionConfig(subscriptionId: string): Promise<SubscriptionConfig | null> {
    return this.configRepo.getSubscriptionConfig(subscriptionId);
  }

  async setSubscriptionConfig(subscriptionId: string, config: SubscriptionConfig): Promise<void> {
    return this.configRepo.setSubscriptionConfig(subscriptionId, config);
  }

  // ─── Clinic Config ────────────────────────────────────────────────────────

  async getClinicConfig(clinicId: string, subscriptionId?: string): Promise<ClinicConfig | null> {
    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId() ?? '';
    return this.configRepo.getClinicConfig(clinicId, subId);
  }

  async setClinicConfig(clinicId: string, config: ClinicConfig, subscriptionId?: string): Promise<void> {
    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId() ?? '';
    return this.configRepo.setClinicConfig(clinicId, config, subId);
  }

  // ─── Doctor Config ────────────────────────────────────────────────────────

  async getDoctorConfig(
    userId: string,
    subscriptionId?: string,
    clinicId?: string
  ): Promise<DoctorConfig | null> {
    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId() ?? '';
    const cId = clinicId ?? this.clinicContext.getSelectedClinicId() ?? '';
    return this.configRepo.getDoctorConfig(userId, subId, cId);
  }

  async setDoctorConfig(
    userId: string,
    config: DoctorConfig,
    subscriptionId?: string,
    clinicId?: string
  ): Promise<void> {
    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId() ?? '';
    const cId = clinicId ?? this.clinicContext.getSelectedClinicId() ?? '';
    return this.configRepo.setDoctorConfig(userId, config, subId, cId);
  }

  // ─── Effective Settings (merged) ──────────────────────────────────────────

  async getEffectiveSettings(
    subscriptionId?: string | null,
    clinicId?: string | null,
    userId?: string | null
  ): Promise<SystemSettings> {
    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId();
    const cId = clinicId ?? this.clinicContext.getSelectedClinicId();

    const [subConfig, clinicConfig, doctorConfig] = await Promise.all([
      subId ? this.getSubscriptionConfig(subId) : Promise.resolve(null),
      cId ? this.getClinicConfig(cId) : Promise.resolve(null),
      userId ? this.getDoctorConfig(userId) : Promise.resolve(null),
    ]);

    return resolveEffectiveSettings(subConfig, clinicConfig, doctorConfig);
  }

  // ─── System Config ────────────────────────────────────────────────────────

  async getSystemConfig(): Promise<SystemConfig> {
    return this.configRepo.getSystemConfig();
  }

  async updateSystemConfig(patch: Record<string, number | string>): Promise<void> {
    return this.configRepo.updateSystemConfig(patch);
  }

  async setSystemConfig(data: Record<string, any>): Promise<void> {
    return this.configRepo.setSystemConfig(data);
  }

  async getAvailablePlans(): Promise<PlanOption[]> {
    const config = await this.getSystemConfig();
    const suffix = '_plan_validity_days';
    const plans: PlanOption[] = [];
    for (const rawKey of Object.keys(config)) {
      if (rawKey.endsWith(suffix)) {
        const days = Number(config[rawKey]);
        if (!isNaN(days) && days > 0) {
          const planKey = rawKey.slice(0, rawKey.length - suffix.length);
          plans.push({
            key: planKey,
            label: planKey.charAt(0).toUpperCase() + planKey.slice(1),
            days,
          });
        }
      }
    }
    return plans.sort((a, b) => a.days - b.days);
  }

  async getPlanValidityDays(planKey: string): Promise<number> {
    return this.configRepo.getPlanValidityDays(planKey);
  }

  async computeValidUntil(planKey: string, startDate?: Date): Promise<string> {
    const days = await this.getPlanValidityDays(planKey);
    const base = startDate ?? new Date();
    const expiry = new Date(base);
    expiry.setDate(expiry.getDate() + days);
    return expiry.toISOString();
  }

  isSubscriptionExpired(validUntil: string | undefined): boolean {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  }

  invalidateSystemConfigCache(): void {
    // No-op: cache invalidation is managed inside the repository implementation
  }

  invalidateCache(): void {
    // No-op: cache is managed inside the repository implementation
  }

  invalidateSubscriptionCache(_subscriptionId: string): void {
    // no-op — cache is in the repository
  }

  invalidateClinicCache(_clinicId: string): void {
    // no-op — cache is in the repository
  }

  invalidateDoctorCache(_userId: string): void {
    // no-op — cache is in the repository
  }
}
