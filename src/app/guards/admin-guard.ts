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

            return from(
                authzService.getUserGlobalRoles(email).then(globalRoles => {
                    // Allow both admin and z_admin to reach the admin dashboard
                    if (!globalRoles.includes('admin') && !globalRoles.includes('z_admin')) {
                        router.navigate(['/home']);
                        return false;
                    }
                    return true;
                }).catch(() => {
                    router.navigate(['/home']);
                    return false;
                })
            );
        })
    );
};
