// src/app/services/configService.ts
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './api/firestore-api.service';
import { ClinicContextService } from './clinicContextService';
import {
  SystemSettings,
  SubscriptionConfig,
  ClinicConfig,
  DoctorConfig,
  resolveEffectiveSettings,
  DEFAULT_SYSTEM_SETTINGS
} from '../config/systemSettings';

/** Cache entry with TTL tracking */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for reading/writing per-subscription, per-clinic, and per-doctor
 * configuration overlays from Firestore.
 *
 * Firestore paths:
 *   subscriptions/{subscriptionId}/config/settings
 *   clinics/{clinicId}/config/settings
 *   users/{userId}/config/settings
 *
 * Each config document is a partial overlay of SystemSettings.
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
   * Firestore path: subscriptions/{subscriptionId}/config/settings
   */
  async getSubscriptionConfig(subscriptionId: string): Promise<SubscriptionConfig | null> {
    if (!subscriptionId) return null;

    const cached = this.getFromCache(this.subscriptionCache, subscriptionId);
    if (cached !== undefined) return cached;

    try {
      const result = await this.api.getDocument(
        `subscriptions/${subscriptionId}/config`,
        'settings'
      );
      if (!result) return null;

      const config = this.extractConfigData<SubscriptionConfig>(result.data);
      this.addToCache(this.subscriptionCache, subscriptionId, config);
      console.log('⚙️  Subscription config loaded for:', subscriptionId);
      return config;
    } catch (error) {
      console.warn('Failed to load subscription config:', subscriptionId, error);
      return null;
    }
  }

  /**
   * Write/update the subscription-level config overlay.
   */
  async setSubscriptionConfig(
    subscriptionId: string,
    config: SubscriptionConfig
  ): Promise<void> {
    if (!subscriptionId) throw new Error('subscriptionId is required');

    const payload = this.buildPayload(config);
    await this.api.setDocument(
      `subscriptions/${subscriptionId}/config`,
      'settings',
      payload
    );
    this.subscriptionCache.delete(subscriptionId);
    console.log('✓ Subscription config saved for:', subscriptionId);
  }

  // ─── Clinic Config ────────────────────────────────────────────────────────

  /**
   * Read the clinic-level config overlay.
   * Firestore path: clinics/{clinicId}/config/settings
   */
  async getClinicConfig(clinicId: string): Promise<ClinicConfig | null> {
    if (!clinicId) return null;

    const cached = this.getFromCache(this.clinicCache, clinicId);
    if (cached !== undefined) return cached;

    try {
      const result = await this.api.getDocument(
        `clinics/${clinicId}/config`,
        'settings'
      );
      if (!result) return null;

      const config = this.extractConfigData<ClinicConfig>(result.data);
      this.addToCache(this.clinicCache, clinicId, config);
      console.log('⚙️  Clinic config loaded for:', clinicId);
      return config;
    } catch (error) {
      console.warn('Failed to load clinic config:', clinicId, error);
      return null;
    }
  }

  /**
   * Write/update the clinic-level config overlay.
   */
  async setClinicConfig(
    clinicId: string,
    config: ClinicConfig
  ): Promise<void> {
    if (!clinicId) throw new Error('clinicId is required');

    const payload = this.buildPayload(config);
    await this.api.setDocument(
      `clinics/${clinicId}/config`,
      'settings',
      payload
    );
    this.clinicCache.delete(clinicId);
    console.log('✓ Clinic config saved for:', clinicId);
  }

  // ─── Doctor Config ────────────────────────────────────────────────────────

  /**
   * Read the doctor-level config overlay.
   * Firestore path: users/{userId}/config/settings
   */
  async getDoctorConfig(userId: string): Promise<DoctorConfig | null> {
    if (!userId) return null;

    const cached = this.getFromCache(this.doctorCache, userId);
    if (cached !== undefined) return cached;

    try {
      const result = await this.api.getDocument(
        `users/${userId}/config`,
        'settings'
      );
      if (!result) return null;

      const config = this.extractConfigData<DoctorConfig>(result.data);
      this.addToCache(this.doctorCache, userId, config);
      console.log('⚙️  Doctor config loaded for:', userId);
      return config;
    } catch (error) {
      console.warn('Failed to load doctor config:', userId, error);
      return null;
    }
  }

  /**
   * Write/update the doctor-level config overlay.
   */
  async setDoctorConfig(
    userId: string,
    config: DoctorConfig
  ): Promise<void> {
    if (!userId) throw new Error('userId is required');

    const payload = this.buildPayload(config);
    await this.api.setDocument(
      `users/${userId}/config`,
      'settings',
      payload
    );
    this.doctorCache.delete(userId);
    console.log('✓ Doctor config saved for:', userId);
  }

  // ─── Effective Settings (merged) ──────────────────────────────────────────

  /**
   * Resolve the fully-merged SystemSettings for a given context.
   *
   * Merge order: System Defaults → Subscription → Clinic → Doctor
   *
   * All parameters are optional. When omitted, the corresponding layer
   * is skipped and the previous layer's values pass through unchanged.
   *
   * @param subscriptionId  Subscription ID (falls back to ClinicContextService)
   * @param clinicId        Clinic ID (falls back to ClinicContextService)
   * @param userId          Doctor user ID (Firestore doc ID, not email)
   * @returns               Fully resolved SystemSettings
   */
  async getEffectiveSettings(
    subscriptionId?: string | null,
    clinicId?: string | null,
    userId?: string | null
  ): Promise<SystemSettings> {
    const subId = subscriptionId ?? this.clinicContext.getSubscriptionId();
    const cId = clinicId ?? this.clinicContext.getSelectedClinicId();

    // Fetch all config layers in parallel
    const [subConfig, clinicConfig, doctorConfig] = await Promise.all([
      subId ? this.getSubscriptionConfig(subId) : Promise.resolve(null),
      cId ? this.getClinicConfig(cId) : Promise.resolve(null),
      userId ? this.getDoctorConfig(userId) : Promise.resolve(null),
    ]);

    return resolveEffectiveSettings(subConfig, clinicConfig, doctorConfig);
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

  /** Invalidate all config caches. */
  invalidateCache(): void {
    this.subscriptionCache.clear();
    this.clinicCache.clear();
    this.doctorCache.clear();
  }

  /** Invalidate a specific subscription config cache entry. */
  invalidateSubscriptionCache(subscriptionId: string): void {
    this.subscriptionCache.delete(subscriptionId);
  }

  /** Invalidate a specific clinic config cache entry. */
  invalidateClinicCache(clinicId: string): void {
    this.clinicCache.delete(clinicId);
  }

  /** Invalidate a specific doctor config cache entry. */
  invalidateDoctorCache(userId: string): void {
    this.doctorCache.delete(userId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getFromCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string
  ): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  private addToCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    data: T
  ): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Extract config data from a raw Firestore document.
   * Strips Firestore metadata fields (updated_at, updated_by) and returns
   * only the config overlay fields.
   */
  private extractConfigData<T>(raw: any): T {
    if (!raw || typeof raw !== 'object') return {} as T;
    const { updated_at, updated_by, ...configFields } = raw;
    return configFields as T;
  }

  /**
   * Build the Firestore document payload by adding metadata fields.
   */
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
