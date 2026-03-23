import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of, map } from 'rxjs';

/**
 * Base auth guard — only checks if user is logged in.
 * Redirects to /login if not authenticated.
 * Used for routes accessible by ALL roles (e.g. /add-appointment, /appointments).
 */
export const authGuard: CanActivateFn = () => {
    const authService = inject(AuthenticationService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        map(() => {
            if (authService.isLoggedIn()) return true;
            router.navigate(['/login']);
            return false;
        })
    );
};

/**
 * Doctor guard — allows only users with role === 'doctor'.
 * Redirects receptionists to /reception-home.
 * Redirects unauthenticated users to /login.
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
                router.navigate(['/login']);
                return of(false);
            }
            const email = authService.currentUserValue?.email || '';
            return from(authorizationService.getUserRole(email)).pipe(
                map(role => {
                    if (role === 'receptionist') {
                        router.navigate(['/reception-home']);
                        return false;
                    }
                    return true;
                })
            );
        })
    );
};

/**
 * Receptionist guard — allows only users with role === 'receptionist'.
 * Redirects doctors to /home.
 * Redirects unauthenticated users to /login.
 */
export const receptionGuard: CanActivateFn = () => {
    const authService = inject(AuthenticationService);
    const authorizationService = inject(AuthorizationService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        switchMap(() => {
            if (!authService.isLoggedIn()) {
                router.navigate(['/login']);
                return of(false);
            }
            const email = authService.currentUserValue?.email || '';
            return from(authorizationService.getUserRole(email)).pipe(
                map(role => {
                    if (role === 'doctor') {
                        router.navigate(['/home']);
                        return false;
                    }
                    return true;
                })
            );
        })
    );
};