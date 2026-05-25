// src/app/guards/admin-guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { FirestoreApiService } from '../services/firestore-api.service';
import { filter, take, switchMap, from, of } from 'rxjs';

/**
 * Admin guard — allows only users whose `users` document contains
 * `global_roles: ['admin']` (or includes 'admin' in the array).
 *
 * Redirects unauthenticated users to /login.
 * Redirects non-admins to /home.
 */
export const adminGuard: CanActivateFn = () => {
    const authService = inject(AuthenticationService);
    const api = inject(FirestoreApiService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        switchMap(() => {
            if (!authService.isLoggedIn()) {
                router.navigate(['/login']);
                return of(false);
            }

            const email = (authService.currentUserValue?.email || '').toLowerCase().trim();

            return from(
                api.runQuery('', {
                    collectionId: 'users',
                    filters: [{ field: 'email', op: '==', value: email }],
                }).then(docs => {
                    if (docs.length === 0) {
                        router.navigate(['/home']);
                        return false;
                    }
                    const globalRoles: string[] = docs[0].data['global_roles'] || [];
                    if (!globalRoles.includes('admin')) {
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
