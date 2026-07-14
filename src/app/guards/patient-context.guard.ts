// src/app/guards/patient-context.guard.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthenticationService } from '../services/authenticationService';
import { AuthorizationService } from '../services/authorizationService';
import { PatientContextService } from '../services/patientContextService';
import { filter, take, switchMap, from, of, map } from 'rxjs';

/**
 * patientContextGuard
 *
 * Guards /patient/view and /patient/add-visit.
 *
 * Combines:
 *   1. doctorGuard logic  — must be authenticated with a clinical role.
 *   2. Context check       — history.state.patientId OR sessionStorage context
 *      must be present; otherwise redirects to /home.
 *
 * This guard never exposes the patient ID in the URL.
 */
export const patientContextGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthenticationService);
    const authorizationService = inject(AuthorizationService);
    const patientContextService = inject(PatientContextService);
    const router = inject(Router);

    return authService.authReady$.pipe(
        filter(ready => ready),
        take(1),
        switchMap(() => {
            // ── 1. Authentication check ──
            if (!authService.isLoggedIn()) {
                router.navigate(['/app/login']);
                return of(false);
            }

            const email = authService.currentUserValue?.email || '';
            if (!email) {
                router.navigate(['/app/login']);
                return of(false);
            }

            return from(authorizationService.getUserRole(email)).pipe(
                map(role => {
                    // ── 2. Role check (mirrors doctorGuard) ──
                    if (role === 'receptionist') {
                        router.navigate(['/home']);
                        return false;
                    }
                    if (role === 'z_admin') {
                        router.navigate(['/app/login']);
                        return false;
                    }

                    // ── 3. Patient context check ──
                    // history.state carries the ID for fresh navigation.
                    // patientContextService falls back to sessionStorage for refresh.
                    const navState = history.state as { patientId?: string } | undefined;
                    const patientIdFromState = navState?.patientId?.trim();

                    if (patientIdFromState) {
                        // Fresh navigation — seed the context service so the component
                        // can read it without touching the URL.
                        patientContextService.setPatient(patientIdFromState);
                        return true;
                    }

                    // Fallback: try sessionStorage (survives F5 refresh)
                    const restoredId = patientContextService.getPatientId();
                    if (restoredId) {
                        return true;
                    }

                    // No context at all — direct URL access in a new tab or stale link.
                    // Redirect to home gracefully.
                    router.navigate(['/home']);
                    return false;
                })
            );
        })
    );
};
