import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of, map } from 'rxjs';

export const superAdminGuard: CanActivateFn = () => {
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
                    if (role === 'z_admin') return true;
                    router.navigate(['/login']);
                    return false;
                })
            );
        })
    );
};

export const ownerGuard: CanActivateFn = () => {
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
                    if (role === 'subscription_owner') return true;
                    router.navigate(['/login']);
                    return false;
                })
            );
        })
    );
};
