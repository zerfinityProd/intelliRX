// src/app/guards/expired-subscription.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { ClinicContextService } from '../services/clinicContextService';

/**
 * Expired-subscription gate.
 *
 * When an admin / subscription-owner whose subscription has lapsed tries to
 * navigate to any guarded route (dashboard, home, etc.) they are bounced back
 * to /admin/subscription so they can renew before accessing anything else.
 *
 * z_admin users and non-admin staff are unaffected:
 *   – z_admin   → bypassed entirely (super-admin guard handles them)
 *   – doctor / receptionist → handled separately by /subscription-expired flow
 */
export const expiredSubscriptionGuard: CanActivateFn = async () => {
    const authService   = inject(AuthenticationService);
    const authzService  = inject(AuthorizationService);
    const clinicCtx     = inject(ClinicContextService);
    const router        = inject(Router);

    // Only check authenticated users with a verified email
    if (!authService.isLoggedIn() || !authService.isEmailVerified()) {
        return true; // let the other guards handle unauthenticated requests
    }

    const email = (authService.currentUserValue?.email || '').toLowerCase().trim();
    if (!email) return true;

    try {
        const [globalRoles, role] = await Promise.all([
            authzService.getUserGlobalRoles(email),
            authzService.getUserRole(email),
        ]);

        // z_admin bypasses subscription checks entirely
        if (role === 'z_admin' || globalRoles.includes('z_admin')) return true;

        // Only block admins / subscription owners — doctors & receptionists
        // are handled by the logout-to-subscription-expired flow on login.
        const isAdmin =
            globalRoles.includes('admin') || role === 'subscription_owner';
        if (!isAdmin) return true;

        const expiryStatus = await authzService.checkSubscriptionExpiry(email);
        if (expiryStatus !== 'expired') return true;

        // Subscription is expired — persist subscriptionId and redirect to manage page
        try {
            const subId = await authzService.getUserSubscriptionId(email);
            if (subId) clinicCtx.setClinicContext(null, subId);
        } catch { /* non-critical */ }

        router.navigate(['/admin/subscription']);
        return false;

    } catch {
        // On any error fall through and let the normal guards decide
        return true;
    }
};
