// src/app/services/subscriptionExpiryNotificationService.ts
import { Injectable, inject } from '@angular/core';
import { SubscriptionRepository } from '../repositories/interfaces/subscription.repository';
import { PlanRepository } from '../repositories/interfaces/plan.repository';
import { isWithinExpiryWindow, getDaysUntilExpiry } from '../utilities/subscription-expiry';

/** Session key used to cache the check result within a single browser session. */
const SESSION_KEY = 'irx.sub_expiry_notify';

/**
 * SubscriptionExpiryNotificationService
 *
 * Centralises all logic for determining whether the subscription-expiring
 * in-app banner should be shown to the current user.
 *
 * Rules (from requirements):
 * - Paid plans: read `plan_ending_nf` from the plans collection.
 *   Show the banner when today falls in the window
 *   [expiry - plan_ending_nf days, expiry).
 * - Demo plans: no `plan_ending_nf` field — show every day while active.
 * - Already-expired subscriptions: return false (existing expired-plan
 *   flow handles that).
 * - Missing / invalid data: return false (fail safe, no false alarms).
 *
 * Never imports FirestoreApiService or any Firebase class directly.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionExpiryNotificationService {
    private readonly subscriptionRepo = inject(SubscriptionRepository);
    private readonly planRepo = inject(PlanRepository);

    // ── Session dismiss ──────────────────────────────────────────────────

    /**
     * Marks the banner as dismissed for the current browser session.
     * The banner will re-appear after the next login.
     */
    markSessionDismissed(): void {
        try { sessionStorage.setItem(SESSION_KEY, 'dismissed'); } catch { /* ignore */ }
    }

    /** True when the user has already dismissed the banner this session. */
    isSessionDismissed(): boolean {
        try { return sessionStorage.getItem(SESSION_KEY) === 'dismissed'; } catch { return false; }
    }

    /**
     * Clears the session dismiss flag so the banner can appear again
     * (called on logout so a fresh login always re-evaluates).
     */
    clearSessionDismiss(): void {
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    }

    // ── Core check ───────────────────────────────────────────────────────

    /**
     * Determines whether the subscription-expiring notification should be shown.
     *
     * @param subscriptionId  The active subscription ID from ClinicContextService.
     * @returns               `true` when the banner should be displayed.
     */
    async shouldShowExpiryNotification(subscriptionId: string | null): Promise<boolean> {
        if (!subscriptionId) return false;
        if (this.isSessionDismissed()) return false;

        try {
            // 1. Fetch the subscription document
            const subscription = await this.subscriptionRepo.getSubscriptionById(subscriptionId);
            if (!subscription) return false;

            // 2. Only notify for active subscriptions (expired ones use a separate flow)
            if (subscription.status !== 'active') return false;

            const validUntil = subscription.valid_until;
            if (!validUntil) return false;

            // 3. Determine plan_ending_nf from the plans collection
            //    plan.name holds the plan key (e.g. "starter", "demo")
            const planKey = (subscription.plan as any)?.name ?? (subscription.plan as any);
            let notifyDaysBeforeExpiry: number | undefined = undefined;

            if (planKey && typeof planKey === 'string') {
                try {
                    const planDetail = await this.planRepo.getPlanByKey(planKey);
                    // plan_ending_nf is undefined for demo plans → notify daily
                    notifyDaysBeforeExpiry = planDetail?.plan_ending_nf;
                } catch {
                    // Non-critical: treat as demo (notify daily)
                }
            }

            // 4. Delegate date-window logic to the pure utility
            return isWithinExpiryWindow(validUntil, notifyDaysBeforeExpiry ?? null);
        } catch (err) {
            console.warn('[SubscriptionExpiryNotification] Check failed:', err);
            return false;
        }
    }

    /**
     * Convenience: returns how many calendar days remain until `valid_until`
     * for display in the banner.  Returns `null` when indeterminate.
     */
    async getDaysRemaining(subscriptionId: string | null): Promise<number | null> {
        if (!subscriptionId) return null;
        try {
            const subscription = await this.subscriptionRepo.getSubscriptionById(subscriptionId);
            return getDaysUntilExpiry(subscription?.valid_until ?? null);
        } catch {
            return null;
        }
    }
}
