import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { filter, take, switchMap, from, of, timeout, catchError } from 'rxjs';

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
    const firebaseAuth = inject(Auth);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        // 15-second timeout: if onAuthStateChanged Firestore calls are slow,
        // fall back to checking Firebase auth directly rather than hanging forever.
        timeout(15000),
        catchError(() => of(true)),
        take(1),
        switchMap(() => {
            // If authService has no currentUser (timeout path), check Firebase auth directly
            const isSignedIn = authService.isLoggedIn() || !!firebaseAuth.currentUser;
            if (!isSignedIn) {
                router.navigate(['/app/login']);
                return of(false);
            }

            const email = (authService.currentUserValue?.email
                || firebaseAuth.currentUser?.email
                || '').toLowerCase().trim();

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
