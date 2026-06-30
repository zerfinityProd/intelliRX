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

/** Cache entry with TTL tracking */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for reading/writing per-subscription, per-clinic, and per-doctor
 * configuration overlays from Firestore.
 *
 * All configs live in the top-level 'configurations' collection with
 * prefixed document IDs so every path is a valid 2-segment REST path:
 *
 *   configurations/sub_{subscriptionId}   ← subscription-level flags & slot interval
 *   configurations/clinic_{clinicId}      ← per-clinic slot override
 *   configurations/user_{userId}          ← per-doctor preferences
 *   configurations/system                 ← system-wide settings (read-only here)
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
   * Firestore path: configurations/sub_{subscriptionId}
   */
  async getSubscriptionConfig(subscriptionId: string): Promise<SubscriptionConfig | null> {
    if (!subscriptionId) return null;

    const cached = this.getFromCache(this.subscriptionCache, subscriptionId);
    if (cached !== undefined) return cached;

    try {
      const result = await this.api.getDocument('configurations', `sub_${subscriptionId}`);
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
   * Firestore path: configurations/sub_{subscriptionId}
   */
  async setSubscriptionConfig(
    subscriptionId: string,
    config: SubscriptionConfig
  ): Promise<void> {
    if (!subscriptionId) throw new Error('subscriptionId is required');

    const payload = this.buildPayload(config);
    await this.api.setDocument('configurations', `sub_${subscriptionId}`, payload);
    this.subscriptionCache.delete(subscriptionId);
  }

  // ─── Clinic Config ────────────────────────────────────────────────────────

  /**
   * Read the clinic-level config overlay.
   * Firestore path: configurations/sub_{subId}/clinics/{clinicId}
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
      const result = await this.api.getDocument(`configurations/sub_${subId}/clinics`, clinicId);
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
   * Firestore path: configurations/sub_{subId}/clinics/{clinicId}
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
    await this.api.setDocument(`configurations/sub_${subId}/clinics`, clinicId, payload);
    this.clinicCache.delete(clinicId);
  }

  // ─── Doctor Config ────────────────────────────────────────────────────────

  /**
   * Read the doctor-level config overlay.
   * Firestore path: configurations/sub_{subId}/clinics/{clinicId}/users/{userId}
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
        `configurations/sub_${subId}/clinics/${cId}/users`, userId
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
   * Firestore path: configurations/sub_{subId}/clinics/{clinicId}/users/{userId}
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
      `configurations/sub_${subId}/clinics/${cId}/users`, userId, payload
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
