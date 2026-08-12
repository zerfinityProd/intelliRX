// src/app/repositories/firebase/firebase-config.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR CONFIG DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { ClinicContextService } from '../../services/clinicContextService';
import { ConfigRepository } from '../interfaces/config.repository';
import {
  SubscriptionConfig,
  ClinicConfig,
  DoctorConfig,
} from '../../config/userSettings';
import { SystemConfig } from '../../models/subscription.model';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class FirebaseConfigRepository extends ConfigRepository {
  private api = inject(FirestoreApiService);
  private clinicContext = inject(ClinicContextService);

  private subscriptionCache = new Map<string, CacheEntry<SubscriptionConfig>>();
  private clinicCache = new Map<string, CacheEntry<ClinicConfig>>();
  private doctorCache = new Map<string, CacheEntry<DoctorConfig>>();
  private systemConfigCache: SystemConfig | null = null;
  private systemConfigFetchTime = 0;
  private readonly CACHE_TTL = 10 * 60 * 1000;

  async getSubscriptionConfig(subscriptionId: string): Promise<SubscriptionConfig | null> {
    if (!subscriptionId) return null;
    const cached = this.getFromCache(this.subscriptionCache, subscriptionId);
    if (cached !== undefined) return cached;
    try {
      const result = await this.api.getDocument('configurations', subscriptionId);
      if (!result) return null;
      const config = this.extractConfigData<SubscriptionConfig>(result.data);
      this.addToCache(this.subscriptionCache, subscriptionId, config);
      return config;
    } catch {
      return null;
    }
  }

  async setSubscriptionConfig(subscriptionId: string, config: SubscriptionConfig): Promise<void> {
    if (!subscriptionId) throw new Error('subscriptionId is required');
    const payload = this.buildPayload(config);
    await this.api.setDocument('configurations', subscriptionId, payload);
    this.subscriptionCache.delete(subscriptionId);
  }

  async getClinicConfig(clinicId: string, subscriptionId: string): Promise<ClinicConfig | null> {
    if (!clinicId) return null;
    const cached = this.getFromCache(this.clinicCache, clinicId);
    if (cached !== undefined) return cached;
    const subId = subscriptionId || this.clinicContext.getSubscriptionId();
    if (!subId) return null;
    try {
      const result = await this.api.getDocument(`configurations/${subId}/clinics`, clinicId);
      if (!result) return null;
      const config = this.extractConfigData<ClinicConfig>(result.data);
      this.addToCache(this.clinicCache, clinicId, config);
      return config;
    } catch {
      return null;
    }
  }

  async setClinicConfig(clinicId: string, config: ClinicConfig, subscriptionId: string): Promise<void> {
    if (!clinicId) throw new Error('clinicId is required');
    const subId = subscriptionId || this.clinicContext.getSubscriptionId();
    if (!subId) throw new Error('Subscription context not set');
    const payload = this.buildPayload(config);
    await this.api.setDocument(`configurations/${subId}/clinics`, clinicId, payload);
    this.clinicCache.delete(clinicId);
  }

  async getDoctorConfig(userId: string, subscriptionId: string, clinicId: string): Promise<DoctorConfig | null> {
    if (!userId) return null;
    const cached = this.getFromCache(this.doctorCache, userId);
    if (cached !== undefined) return cached;
    const subId = subscriptionId || this.clinicContext.getSubscriptionId();
    const cId = clinicId || this.clinicContext.getSelectedClinicId();
    if (!subId || !cId) return null;
    try {
      const result = await this.api.getDocument(
        `configurations/${subId}/clinics/${cId}/users`, userId
      );
      if (!result) return null;
      const config = this.extractConfigData<DoctorConfig>(result.data);
      this.addToCache(this.doctorCache, userId, config);
      return config;
    } catch {
      return null;
    }
  }

  async setDoctorConfig(userId: string, config: DoctorConfig, subscriptionId: string, clinicId: string): Promise<void> {
    if (!userId) throw new Error('userId is required');
    const subId = subscriptionId || this.clinicContext.getSubscriptionId();
    const cId = clinicId || this.clinicContext.getSelectedClinicId();
    if (!subId || !cId) throw new Error('Subscription and clinic context required');
    const payload = this.buildPayload(config);
    await this.api.setDocument(
      `configurations/${subId}/clinics/${cId}/users`, userId, payload
    );
    this.doctorCache.delete(userId);
  }

  async getSystemConfig(): Promise<SystemConfig> {
    const now = Date.now();
    if (this.systemConfigCache && (now - this.systemConfigFetchTime < this.CACHE_TTL)) {
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

  async updateSystemConfig(patch: Record<string, number | string>): Promise<void> {
    await this.api.updateDocument('configurations', 'system', {
      ...patch,
      updated_at: new Date().toISOString(),
    });
    // Invalidate cache so next read gets fresh data
    this.systemConfigCache = null;
    this.systemConfigFetchTime = 0;
  }

  async getPlanValidityDays(planKey: string): Promise<number> {
    try {
      const planDoc = await this.api.getDocument('plans', planKey);
      const days = Number(planDoc?.data?.['validity_days'] || 0);
      if (!isNaN(days) && days > 0) return days;
    } catch { /* fall through */ }
    const config = await this.getSystemConfig();
    const field = `${planKey}_plan_validity_days`;
    const val = Number(config[field]);
    return !isNaN(val) && val > 0 ? val : 30;
  }

  // ── Cache helpers ────────────────────────────────────────────────────────────

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
    return { ...this.removeUndefined(config), updated_at: new Date().toISOString() };
  }

  private removeUndefined(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) cleaned[key] = obj[key];
    }
    return cleaned;
  }
}

