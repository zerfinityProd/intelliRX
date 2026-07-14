// src/app/repositories/firebase/firebase-subscription.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR SUBSCRIPTION DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { SubscriptionRepository } from '../interfaces/subscription.repository';
import { Subscription } from '../../models/subscription.model';

@Injectable()
export class FirebaseSubscriptionRepository extends SubscriptionRepository {
  private api = inject(FirestoreApiService);

  private _subsCache: (Subscription & { id: string })[] | null = null;
  private _subsFetchPromise: Promise<(Subscription & { id: string })[]> | null = null;

  async getSubscriptions(): Promise<(Subscription & { id: string })[]> {
    if (this._subsCache) return [...this._subsCache];
    if (!this._subsFetchPromise) {
      this._subsFetchPromise = this.api
        .listDocuments('subscriptions', 500)
        .then(docs => {
          this._subsCache = docs.map(d => ({ ...(d.data as Subscription), id: d.id }));
          this._subsFetchPromise = null;
          return [...this._subsCache!];
        })
        .catch(err => {
          this._subsFetchPromise = null;
          throw err;
        });
    }
    return this._subsFetchPromise;
  }

  async getSubscriptionById(id: string): Promise<(Subscription & { id: string }) | null> {
    const result = await this.api.getDocument('subscriptions', id);
    if (!result) return null;
    return { ...(result.data as Subscription), id: result.id };
  }

  async getSubscriptionSummary(id: string): Promise<{ name: string } | null> {
    try {
      const result = await this.api.getDocument('subscriptions', id);
      if (!result) return null;
      const name = result.data['entity_name'] || result.data['name'] || id;
      return { name };
    } catch {
      return null;
    }
  }

  async createSubscription(
    data: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string,
    validityDays?: number
  ): Promise<string> {
    const id = explicitId ?? await this.api.getNextSequentialId('sub');
    const now = new Date().toISOString();

    let valid_until: string | undefined;
    if (validityDays && validityDays > 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + validityDays);
      valid_until = expiry.toISOString();
    }

    await this.api.setDocument('subscriptions', id, {
      ...data,
      ...(valid_until ? { valid_until } : {}),
      created_at: now,
      updated_at: now,
    });
    this.invalidateCache();
    return id;
  }

  async updateSubscription(id: string, data: Partial<Subscription>): Promise<void> {
    await this.api.updateDocument('subscriptions', id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
    this.invalidateCache();
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.api.deleteDocument('subscriptions', id);
    this.invalidateCache();
  }

  invalidateCache(): void {
    this._subsCache = null;
    this._subsFetchPromise = null;
  }

  computeNextId(existingIds: string[]): string {
    const max = existingIds.reduce((m, id) => {
      const match = id.match(/^sub_(\d+)$/);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `sub_${max + 1}`;
  }
}

