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

            // Block unverified registration users from admin routes.
            if (!authService.isEmailVerified()) {
                router.navigate(['/app/login']);
                return of(false);
            }

            const email = (authService.currentUserValue?.email || '').toLowerCase().trim();

            return from(
                (async () => {
                    const globalRoles = await authzService.getUserGlobalRoles(email);
                    // Primary: explicit admin/z_admin role in global_roles
                    if (globalRoles.includes('admin') || globalRoles.includes('z_admin')) {
                        return true;
                    }
                    // Fallback: check if this email owns any subscription.
                    // Covers subscription owners whose global_roles is ['doctor'] only
                    // (the admin role was never explicitly written to their user doc).
                    const isOwner = await authzService.isSubscriptionOwner(email);
                    if (!isOwner) {
                        router.navigate(['/home']);
                        return false;
                    }
                    return true;
                })().catch(() => {
                    router.navigate(['/home']);
                    return false;
                })
            );
        })
    );
};
