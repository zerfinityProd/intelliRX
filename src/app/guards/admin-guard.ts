// src/app/guards/admin-guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of } from 'rxjs';

/**
 * Admin guard — allows users whose role is 'subscription_owner', 'admin', or 'z_admin'.
 *
 * Primary check:  authService.currentUserValue.role  (set from Firestore during login,
 *                 no extra network call needed on navigation).
 * Fallback check: getUserGlobalRoles() Firestore lookup (used only when role is absent,
 *                 e.g. after a page refresh where onAuthStateChanged catch path ran).
 *
 * Redirects unauthenticated users to /app/login.
 * Redirects non-admins to /home.
 */

const ADMIN_ROLES = ['subscription_owner', 'admin', 'z_admin'];

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

            const user = authService.currentUserValue;
            const email = (user?.email || '').toLowerCase().trim();

            if (!email) {
                console.warn('[AdminGuard] No email on currentUserValue — redirecting to login');
                router.navigate(['/app/login']);
                return of(false);
            }

            // ── Primary: use role already set by the auth service ────────────
            // The auth service sets currentUserValue.role from Firestore during
            // login and on every page load via onAuthStateChanged. No extra
            // Firestore call is needed here.
            const localRole = (user?.role || '').toLowerCase();
            if (ADMIN_ROLES.includes(localRole)) {
                console.debug('[AdminGuard] Access granted via local role:', localRole);
                return of(true);
            }

            // ── Fallback: Firestore lookup ────────────────────────────────────
            // Reached only if role is not set (rare: onAuthStateChanged error path).
            console.debug('[AdminGuard] Local role missing/unknown, querying Firestore for:', email);
            return from(
                authzService.getUserGlobalRoles(email).then(globalRoles => {
                    console.debug('[AdminGuard] Firestore globalRoles:', globalRoles);
                    const hasAdminRole = globalRoles.some(r => ADMIN_ROLES.includes(r));
                    if (!hasAdminRole) {
                        console.warn('[AdminGuard] No admin role — redirecting to /home. globalRoles:', globalRoles);
                        router.navigate(['/home']);
                        return false;
                    }
                    return true;
                }).catch(err => {
                    console.error('[AdminGuard] Firestore lookup failed — redirecting to /home:', err);
                    router.navigate(['/home']);
                    return false;
                })
            );
        })
    );
};
