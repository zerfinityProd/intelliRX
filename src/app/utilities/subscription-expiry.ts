/**
 * Subscription expiry utility helpers.
 *
 * All calculations use **local calendar days** so the notification window
 * matches what the user sees on their device, regardless of timezone.
 *
 * These are pure functions — no Angular DI, easily unit-testable.
 */

/**
 * Returns the number of whole calendar days remaining until `validUntil`.
 *
 * - Returns 0  when `validUntil` is today.
 * - Returns -1 when `validUntil` was yesterday (already expired).
 * - Returns `null` when `validUntil` is missing or cannot be parsed.
 */
export function getDaysUntilExpiry(validUntil: string | null | undefined): number | null {
    if (!validUntil) return null;

    const expiry = new Date(validUntil);
    if (isNaN(expiry.getTime())) return null;

    // Strip time component from both dates so we compare calendar days only
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const expiryMidnight = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((expiryMidnight.getTime() - todayMidnight.getTime()) / msPerDay);
}

/**
 * Returns `true` when the subscription is still active but the user should
 * be notified that it is expiring soon.
 *
 * Rules:
 * - If `validUntil` is missing/invalid → `false`.
 * - If already expired (days < 0) → `false` (expired-plan flow handles that).
 * - **Paid plans** (`plan_ending_nf` is a positive number in the DB):
 *   notify only when `daysLeft <= plan_ending_nf`.
 * - **Demo plans** (`plan_ending_nf` absent / null / 0):
 *   notify every day while the plan is still active.
 *
 * @param validUntil              ISO date string from `subscription.valid_until`
 * @param notifyDaysBeforeExpiry  Value of `plan_ending_nf` from Firestore plans
 *                                collection. Pass `null` / `undefined` for demo.
 */
export function isWithinExpiryWindow(
    validUntil: string | null | undefined,
    notifyDaysBeforeExpiry: number | null | undefined
): boolean {
    const daysLeft = getDaysUntilExpiry(validUntil);

    // Can't determine — or already expired
    if (daysLeft === null || daysLeft < 0) return false;

    const isPaidPlan =
        notifyDaysBeforeExpiry != null &&
        Number.isFinite(notifyDaysBeforeExpiry) &&
        notifyDaysBeforeExpiry > 0;

    if (isPaidPlan) {
        // Paid plan: only notify within the configured window
        return daysLeft <= notifyDaysBeforeExpiry!;
    }

    // Demo plan (plan_ending_nf absent or 0) → notify every day while active
    return true;
}
