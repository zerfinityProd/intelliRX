// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard, doctorGuard, receptionGuard } from './guards/auth-guard';

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
    // ── Doctor-only routes ───────────────────────────────────────────────────
    {
        path: 'home',
        loadComponent: () =>
            import('./components/home/home').then(m => m.HomeComponent),
        canActivate: [doctorGuard]
    },
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
    // ── Receptionist-only routes ─────────────────────────────────────────────
    {
        path: 'reception-home',
        loadComponent: () =>
            import('./components/reception-home/reception-home').then(
                m => m.ReceptionHomeComponent
            ),
        canActivate: [receptionGuard]
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
    // ── Fallback ─────────────────────────────────────────────────────────────
    {
        path: '**',
        redirectTo: '/login'
    }
];