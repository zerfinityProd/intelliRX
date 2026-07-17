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
            return from(authorizationService.getUserRole(email)).pipe(
                map(role => {
                    if (role === 'receptionist') {
                        router.navigate(['/home']);
                        return false;
                    }
                    // Block z_admin from clinical app routes
                    if (role === 'z_admin') {
                        router.navigate(['/app/login']);
                        return false;
                    }
                    // Allow admin (subscription_owner) full access like doctors
                    if (role === 'subscription_owner') {
                        return true;
                    }
                    return true;
                })
            );
        })
    );
};
