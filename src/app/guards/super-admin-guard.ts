// src/app/guards/super-admin-guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of } from 'rxjs';

/**
 * Z-Admin guard — allows only users whose `users` document contains
 * `global_roles` array that includes 'z_admin'.
 *
 * Redirects unauthenticated users to /login.
 * Redirects non-super-admins to /admin-dashboard (if admin) or /home.
 *
 * Uses AuthorizationService (repository-backed) instead of FirestoreApiService directly.
 */
export const superAdminGuard: CanActivateFn = () => {
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
                    if (!globalRoles.includes('z_admin')) {
                        // If they are a regular admin, send to admin dashboard
                        if (globalRoles.includes('admin')) {
                            router.navigate(['/admin-dashboard']);
                        } else {
                            router.navigate(['/home']);
                        }
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
