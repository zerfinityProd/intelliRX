// src/app/services/configService.ts
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
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

/** Cache entry with TTL tracking */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for reading/writing per-subscription, per-clinic, and per-doctor
 * configuration overlays from Firestore.
 *
 * Firestore structure (nested subcollections):
 *
 *   configurations/sub/{subscriptionId}                             ← subscription-level flags & slot interval
 *   configurations/sub/{subscriptionId}/clinics/{clinicId}          ← per-clinic slot override
 *   configurations/sub/{subscriptionId}/clinics/{clinicId}/users/{userId}  ← per-doctor preferences
 *   configurations/system                                           ← system-wide settings (read-only here)
 *
 * Use `getEffectiveSettings()` to resolve the final merged settings.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {

  private api = inject(FirestoreApiService);
  private clinicContext = inject(ClinicContextService);

  /** In-memory caches */
  private subscriptionCache = new Map<string, CacheEntry<SubscriptionConfig>>();
  private clinicCache = new Map<string, CacheEntry<ClinicConfig>>();
  private doctorCache = new Map<string, CacheEntry<DoctorConfig>>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // ─── Subscription Config ──────────────────────────────────────────────────

  /**
   * Read the subscription-level config overlay.
   * Firestore path: configurations/sub/{subscriptionId}
   */
  async getSubscriptionConfig(subscriptionId: string): Promise<SubscriptionConfig | null> {
    if (!subscriptionId) return null;

    const cached = this.getFromCache(this.subscriptionCache, subscriptionId);
    if (cached !== undefined) return cached;

    try {
      const result = await this.api.getDocument('configurations/sub', subscriptionId);
      if (!result) return null;

      const config = this.extractConfigData<SubscriptionConfig>(result.data);
      this.addToCache(this.subscriptionCache, subscriptionId, config);
      return config;
    } catch {
      return null;
    }
  }

  /**
   * Write/update the subscription-level config overlay.
   * Firestore path: configurations/sub/{subscriptionId}
   */
  async setSubscriptionConfig(
    subscriptionId: string,
    config: SubscriptionConfig
  ): Promise<void> {
    if (!subscriptionId) throw new Error('subscriptionId is required');

    const payload = this.buildPayload(config);
    await this.api.setDocument('configurations/sub', subscriptionId, payload);
    this.subscriptionCache.delete(subscriptionId);
  }

  // ─── Clinic Config ────────────────────────────────────────────────────────

  /**
   * Read the clinic-level config overlay.
   * Firestore path: configurations/sub/{subId}/clinics/{clinicId}
   *
   * @param subscriptionId  Pass explicitly for admin-only flows where clinicContext
   *                        subscription is not set. Doctors/receptionists omit it.
   */
  async getClinicConfig(clinicId: string, subscriptionId?: string): Promise<ClinicConfig | null> {
    if (!clinicId) return null;

    const cached = this.getFromCache(this.clinicCache, clinicId);
    if (cached !== undefined) return cached;

    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId();
    if (!subId) return null;

    try {
      const result = await this.api.getDocument(`configurations/sub/${subId}/clinics`, clinicId);
      if (!result) return null;

      const config = this.extractConfigData<ClinicConfig>(result.data);
      this.addToCache(this.clinicCache, clinicId, config);
      return config;
    } catch {
      return null;
    }
  }

  /**
   * Write/update the clinic-level config overlay.
   * Firestore path: configurations/sub/{subId}/clinics/{clinicId}
   *
   * @param subscriptionId  Pass explicitly for admin-only flows where clinicContext
   *                        subscription is not set. Doctors/receptionists omit it.
   */
  async setClinicConfig(
    clinicId: string,
    config: ClinicConfig,
    subscriptionId?: string
  ): Promise<void> {
    if (!clinicId) throw new Error('clinicId is required');

    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId();
    if (!subId) throw new Error('Subscription context not set');

    const payload = this.buildPayload(config);
    await this.api.setDocument(`configurations/sub/${subId}/clinics`, clinicId, payload);
    this.clinicCache.delete(clinicId);
  }

  // ─── Doctor Config ────────────────────────────────────────────────────────

  /**
   * Read the doctor-level config overlay.
   * Firestore path: configurations/sub/{subId}/clinics/{clinicId}/users/{userId}
   *
   * @param subscriptionId  Falls back to clinicContext when omitted.
   * @param clinicId        Falls back to clinicContext when omitted.
   */
  async getDoctorConfig(
    userId: string,
    subscriptionId?: string,
    clinicId?: string
  ): Promise<DoctorConfig | null> {
    if (!userId) return null;

    const cached = this.getFromCache(this.doctorCache, userId);
    if (cached !== undefined) return cached;

    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId();
    const cId = clinicId ?? this.clinicContext.getSelectedClinicId();
    if (!subId || !cId) return null;

    try {
      const result = await this.api.getDocument(
        `configurations/sub/${subId}/clinics/${cId}/users`, userId
      );
      if (!result) return null;

      const config = this.extractConfigData<DoctorConfig>(result.data);
      this.addToCache(this.doctorCache, userId, config);
      return config;
    } catch {
      return null;
    }
  }

  /**
   * Write/update the doctor-level config overlay.
   * Firestore path: configurations/sub/{subId}/clinics/{clinicId}/users/{userId}
   *
   * @param subscriptionId  Falls back to clinicContext when omitted.
   * @param clinicId        Falls back to clinicContext when omitted.
   */
  async setDoctorConfig(
    userId: string,
    config: DoctorConfig,
    subscriptionId?: string,
    clinicId?: string
  ): Promise<void> {
    if (!userId) throw new Error('userId is required');

    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId();
    const cId = clinicId ?? this.clinicContext.getSelectedClinicId();
    if (!subId || !cId) throw new Error('Subscription and clinic context required');

    const payload = this.buildPayload(config);
    await this.api.setDocument(
      `configurations/sub/${subId}/clinics/${cId}/users`, userId, payload
    );
    this.doctorCache.delete(userId);
  }

  // ─── Effective Settings (merged) ──────────────────────────────────────────

  /**
   * Resolve the fully-merged SystemSettings for a given context.
   *
   * Merge order: System Defaults → Subscription → Clinic → Doctor
   */
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

  private systemConfigCache: SystemConfig | null = null;
  private systemConfigFetchTime = 0;
  private readonly SYSTEM_CONFIG_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Fetch the top-level configurations/system document.
   * Cached for 10 minutes. Returns an empty object if not found.
   */
  async getSystemConfig(): Promise<SystemConfig> {
    const now = Date.now();
    if (this.systemConfigCache && (now - this.systemConfigFetchTime < this.SYSTEM_CONFIG_TTL)) {
      return this.systemConfigCache;
    }
    try {
      const result = await this.api.getDocument('configurations', 'system');
      const data: SystemConfig = result ? (result.data as SystemConfig) : {};
      this.systemConfigCache = data;
      this.systemConfigFetchTime = now;
      return data;
    } catch {
      return {};
    }
  }

  /**
   * Parse configurations/system to return available plan options.
   *
   * Reads all keys matching the pattern `<planKey>_plan_validity_days`.
   * Example Firestore doc:
   *   demo_plan_validity_days: 7
   *   starter_plan_validity_days: 31
   *   pro_plan_validity_days: 365
   *
   * Returns an array sorted ascending by validity days:
   *   [{ key: 'demo', label: 'Demo', days: 7 }, { key: 'starter', ... }, ...]
   */
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

  /**
   * Get validity days for a specific plan key.
   * Priority:
   *   1. `validity_days` field on the plan document in the `plans` collection
   *   2. `<planKey>_plan_validity_days` in configurations/system (legacy)
   *   3. Falls back to 30 days if nothing is found.
   */
  async getPlanValidityDays(planKey: string): Promise<number> {
    // 1. Read directly from the plans collection (primary source)
    try {
      const planDoc = await this.api.getDocument('plans', planKey);
      const days = Number(planDoc?.data?.['validity_days'] || 0);
      if (!isNaN(days) && days > 0) return days;
    } catch { /* fall through */ }

    // 2. Legacy: read from configurations/system
    const config = await this.getSystemConfig();
    const field = `${planKey}_plan_validity_days`;
    const val = Number(config[field]);
    return !isNaN(val) && val > 0 ? val : 30;
  }

  /**
   * Compute an ISO expiry date string for a given plan key.
   * startDate defaults to today.
   */
  async computeValidUntil(planKey: string, startDate?: Date): Promise<string> {
    const days = await this.getPlanValidityDays(planKey);
    const base = startDate ?? new Date();
    const expiry = new Date(base);
    expiry.setDate(expiry.getDate() + days);
    return expiry.toISOString();
  }

  /**
   * Check whether a subscription's `valid_until` date has passed.
   * Returns `true` when the subscription is expired.
   * Returns `false` if `valid_until` is missing (no expiry set — treat as valid).
   */
  isSubscriptionExpired(validUntil: string | undefined): boolean {
    if (!validUntil) return false; // no expiry set → treat as valid
    return new Date(validUntil) < new Date();
  }

  /** Invalidate the system config cache (call after super-admin changes system settings). */
  invalidateSystemConfigCache(): void {
    this.systemConfigCache = null;
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

  invalidateCache(): void {
    this.subscriptionCache.clear();
    this.clinicCache.clear();
    this.doctorCache.clear();
  }

  invalidateSubscriptionCache(subscriptionId: string): void {
    this.subscriptionCache.delete(subscriptionId);
  }

  invalidateClinicCache(clinicId: string): void {
    this.clinicCache.delete(clinicId);
  }

  invalidateDoctorCache(userId: string): void {
    this.doctorCache.delete(userId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  private addToCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  private extractConfigData<T>(raw: any): T {
    if (!raw || typeof raw !== 'object') return {} as T;
    const { updated_at, ...configFields } = raw;
    return configFields as T;
  }

  private buildPayload(config: Record<string, any>): Record<string, any> {
    return {
      ...this.removeUndefined(config),
      updated_at: new Date().toISOString(),
    };
  }

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
