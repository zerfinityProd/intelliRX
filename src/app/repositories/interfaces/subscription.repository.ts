// src/app/repositories/interfaces/subscription.repository.ts
import { Subscription } from '../../models/subscription.model';

/**
 * Abstract token for subscription data access.
 */
export abstract class SubscriptionRepository {
  abstract getSubscriptions(): Promise<(Subscription & { id: string })[]>;

  abstract getSubscriptionById(
    id: string
  ): Promise<(Subscription & { id: string }) | null>;

  /**
   * Returns a minimal summary of a subscription for display labels.
   * Avoids loading a full Subscription model for UI name lookups.
   */
  abstract getSubscriptionSummary(
    id: string
  ): Promise<{ name: string } | null>;

  abstract createSubscription(
    data: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string,
    validityDays?: number
  ): Promise<string>;

  abstract updateSubscription(id: string, data: Partial<Subscription>): Promise<void>;

  abstract deleteSubscription(id: string): Promise<void>;

  abstract invalidateCache(): void;

  abstract computeNextId(existingIds: string[]): string;
}
