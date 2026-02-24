import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth';
import { filter, take, map } from 'rxjs';

/**
 * Auth Guard - Protects routes from unauthorized access.
 * Waits for Firebase to restore auth session before deciding,
 * so hard refresh does not incorrectly redirect to login.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait until Firebase has resolved the initial auth state
  return authService.authReady$.pipe(
    filter(ready => ready),   // wait for first true
    take(1),                  // complete after one emission
    map(() => {
      if (authService.isLoggedIn()) {
        return true;
      }
      router.navigate(['/login']);
      return false;
    })
  );
};