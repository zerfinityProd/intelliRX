import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of, map } from 'rxjs';

/**
 * Base auth guard — checks if user is logged in.
 * Redirects to /app/login if not authenticated.
 * Redirects admin-only users (no clinical role) to /admin-dashboard.
 * Used for routes accessible by ALL clinical roles (e.g. /home, /add-appointment).
 */
export const authGuard: CanActivateFn = () => {
    const authService = inject(AuthenticationService);
    const authorizationService = inject(AuthorizationService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        switchMap(() => {
            if (!authService.isLoggedIn()) {
                router.navigate(['/app/login']);
                return of(false);
            }

            const email = authService.currentUserValue?.email || '';
            if (!email) {
                router.navigate(['/app/login']);
                return of(false);
            }

            return from(authorizationService.getUserGlobalRoles(email)).pipe(
                map(globalRoles => {
                    const isAdmin = globalRoles.includes('admin');
                    const hasClinicalRole = globalRoles.includes('doctor') || globalRoles.includes('receptionist');

                    // Admin-only users (no doctor/receptionist role) cannot access clinical routes
                    if (isAdmin && !hasClinicalRole) {
                        router.navigate(['/admin-dashboard']);
                        return false;
                    }

                    return true;
                })
            );
        })
    );
};

/**
 * Doctor guard — allows only users with role === 'doctor'.
 * Redirects receptionists to /home.
 * Redirects unauthenticated users to /app/login.
 * Redirects admin-only and z_admin users away from clinical routes.
 */
export const doctorGuard: CanActivateFn = () => {
    const authService = inject(AuthenticationService);
    const authorizationService = inject(AuthorizationService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        switchMap(() => {
            if (!authService.isLoggedIn()) {
                router.navigate(['/app/login']);
                return of(false);
            }
            const email = authService.currentUserValue?.email || '';
            return from(authorizationService.getUserGlobalRoles(email)).pipe(
                map(globalRoles => {
                    // z_admin has no clinical access
                    if (globalRoles.includes('z_admin')) {
                        router.navigate(['/app/login']);
                        return false;
                    }
                    // Admin-only users (no doctor/receptionist role) belong in admin dashboard
                    const hasClinicalRole = globalRoles.includes('doctor') || globalRoles.includes('receptionist');
                    if (globalRoles.includes('admin') && !hasClinicalRole) {
                        router.navigate(['/admin-dashboard']);
                        return false;
                    }
                    // Receptionists cannot access doctor-only routes
                    if (!globalRoles.includes('doctor')) {
                        router.navigate(['/home']);
                        return false;
                    }
                    return true;
                })
            );
        })
    );
};
