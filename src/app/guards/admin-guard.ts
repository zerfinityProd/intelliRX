// src/app/guards/admin-guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of } from 'rxjs';

/**
 * Admin guard — allows users whose `users` document contains
 * `global_roles` with 'admin' or 'z_admin'.
 *
 * Redirects unauthenticated users to /login.
 * Redirects non-admins to /home.
 *
 * Uses AuthorizationService (repository-backed) instead of FirestoreApiService directly.
 */
export const adminGuard: CanActivateFn = () => {
    const authService = inject(AuthenticationService);
    const authzService = inject(AuthorizationService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        switchMap(() => {
            if (!authService.isLoggedIn()) {
                router.navigate(['/app/login']);
                return of(false);
            }

            const email = (authService.currentUserValue?.email || '').toLowerCase().trim();

            // Guard against empty email — can happen if currentUserValue hasn't
            // populated yet despite authReady$ emitting. Redirect to login so the
            // user can re-authenticate cleanly.
            if (!email) {
                console.warn('[AdminGuard] No email on currentUserValue — redirecting to login');
                router.navigate(['/app/login']);
                return of(false);
            }

            return from(
                authzService.getUserGlobalRoles(email).then(globalRoles => {
                    console.debug('[AdminGuard] globalRoles for', email, ':', globalRoles);

                    // Accept 'admin', 'z_admin', or 'subscription_owner'
                    const hasAdminRole = globalRoles.includes('admin')
                        || globalRoles.includes('z_admin')
                        || globalRoles.includes('subscription_owner');

                    if (hasAdminRole) return true;

                    // Firestore lookup may have failed transiently (onAuthStateChanged
                    // catch path). Fall back to the role cached in currentUserValue —
                    // set during login or from Firebase token data.
                    const localRole = authService.currentUserValue?.role || '';
                    console.debug('[AdminGuard] Firestore roles empty — checking local role:', localRole);
                    if (localRole === 'subscription_owner' || localRole === 'admin' || localRole === 'z_admin') {
                        console.warn('[AdminGuard] Allowed via local role fallback:', localRole);
                        return true;
                    }

                    console.warn('[AdminGuard] No admin role found — redirecting to /home. globalRoles:', globalRoles, 'localRole:', localRole);
                    router.navigate(['/home']);
                    return false;
                }).catch((err) => {
                    // Firestore completely unavailable — fall back to local role
                    const localRole = authService.currentUserValue?.role || '';
                    console.error('[AdminGuard] getUserGlobalRoles threw:', err, '— localRole:', localRole);
                    if (localRole === 'subscription_owner' || localRole === 'admin' || localRole === 'z_admin') {
                        console.warn('[AdminGuard] Allowed via local role fallback after error');
                        return true;
                    }
                    router.navigate(['/home']);
                    return false;
                })
            );
        })
    );
};


