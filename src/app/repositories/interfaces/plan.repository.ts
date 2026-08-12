// src/app/repositories/interfaces/plan.repository.ts
import { PlanDetail } from '../../models/subscription.model';

/**
 * Abstract token for plan document data access.
 */
export abstract class PlanRepository {
  abstract listPlans(): Promise<PlanDetail[]>;

  abstract getPlanByKey(key: string): Promise<PlanDetail | null>;

  /** Create or fully overwrite a plan document (key = Firestore doc ID). */
  abstract savePlan(key: string, data: Omit<PlanDetail, 'key'>): Promise<void>;

  /** Delete a plan document by key. */
  abstract deletePlan(key: string): Promise<void>;

  abstract invalidateCache(): void;
}
