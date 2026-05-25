// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard, doctorGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: '/login',
        pathMatch: 'full'
    },
    {
        path: 'login',
        loadComponent: () =>
            import('./components/login/login').then(m => m.LoginComponent)
    },
    // ── Home (shared by doctor + receptionist, role-based UI inside) ─────────
    {
        path: 'home',
        loadComponent: () =>
            import('./components/home/home').then(m => m.HomeComponent),
        canActivate: [authGuard]
    },
    // ── Doctor-only routes ───────────────────────────────────────────────────
    {
        path: 'patient/:id',
        loadComponent: () =>
            import('./components/patient-details/patient-details').then(
                m => m.PatientDetailsComponent
            ),
        canActivate: [doctorGuard]
    },
    {
        path: 'patient/:id/add-visit',
        loadComponent: () =>
            import('./components/add-visit-page/add-visit-page').then(
                m => m.AddVisitPageComponent
            ),
        canActivate: [doctorGuard]
    },
    // ── Shared routes (both roles) ───────────────────────────────────────────
    {
        path: 'add-appointment',
        loadComponent: () =>
            import('./components/add-appointment/add-appointment').then(
                m => m.AddAppointmentComponent
            ),
        canActivate: [authGuard]
    },
    {
        path: 'appointments',
        loadComponent: () =>
            import('./components/appointments-list/appointments-list').then(
                m => m.AppointmentsListComponent
            ),
        canActivate: [authGuard]
    },
    // ── Admin ────────────────────────────────────────────────────────────────
    {
        path: 'admin-setup',
        loadComponent: () =>
            import('./components/admin-setup/admin-setup').then(m => m.AdminSetupComponent),
        canActivate: [adminGuard]
    },
    // ── Fallback ─────────────────────────────────────────────────────────────
    {
        path: '**',
        redirectTo: '/login'
    }
];