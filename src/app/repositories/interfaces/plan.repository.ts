// src/app/repositories/interfaces/plan.repository.ts
import { PlanDetail } from '../../models/subscription.model';

/**
 * Abstract token for plan document data access.
 */
export abstract class PlanRepository {
  abstract listPlans(): Promise<PlanDetail[]>;

  abstract getPlanByKey(key: string): Promise<PlanDetail | null>;

  abstract invalidateCache(): void;
}
