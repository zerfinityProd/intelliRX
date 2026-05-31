// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard, doctorGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { superAdminGuard } from './guards/super-admin-guard';

export const routes: Routes = [
    // ── Public Routes (Website) ──
    {
        path: '',
        loadComponent: () => import('./components/public/public-layout/public-layout').then(m => m.PublicLayoutComponent),
        children: [
            { path: '', loadComponent: () => import('./components/public/landing/landing').then(m => m.LandingComponent) },
            { path: 'pricing', loadComponent: () => import('./components/public/pricing/pricing').then(m => m.PricingComponent) },
        ]
    },

    // ── Website Login (Z-Admin only) ──
    {
        path: 'login',
        loadComponent: () => import('./components/login/login').then(m => m.LoginComponent),
        data: { loginMode: 'website' }
    },

    // ── App Login (Admin / Doctors / Receptionists) ──
    {
        path: 'app/login',
        loadComponent: () => import('./components/login/login').then(m => m.LoginComponent),
        data: { loginMode: 'app' }
    },

    // ── Registration (Website — creates a new subscription) ──
    {
        path: 'register',
        loadComponent: () => import('./components/auth/register-wizard/register-wizard').then(m => m.RegisterWizardComponent)
    },
    {
        path: 'onboarding',
        loadComponent: () => import('./components/auth/onboarding/onboarding').then(m => m.OnboardingComponent),
        canActivate: [authGuard]
    },

    // ── Z-Admin Route (Website-side) ──
    {
        path: 'admin',
        loadComponent: () => import('./components/super-admin/super-admin').then(m => m.SuperAdminComponent),
        //canActivate: [superAdminGuard]
    },
    // ── Admin Dashboard (subscription_owner logged via App Login) ──
    {
        path: 'admin-dashboard',
        loadComponent: () => import('./components/admin-dashboard/admin-dashboard').then(m => m.AdminDashboardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'owner',
        loadComponent: () => import('./components/owner-dashboard/owner-dashboard').then(m => m.OwnerDashboardComponent),
        //canActivate: [ownerGuard]
    },

    // ── App Shell (Doctor/Receptionist/Owner acting as clinical staff) ──
    {
        path: 'home',
        loadComponent: () => import('./components/home/home').then(m => m.HomeComponent),
        canActivate: [authGuard]
    },
    {
        path: 'patient/:id',
        loadComponent: () => import('./components/patient-details/patient-details').then(m => m.PatientDetailsComponent),
        canActivate: [doctorGuard]
    },
    {
        path: 'patient/:id/add-visit',
        loadComponent: () => import('./components/add-visit-page/add-visit-page').then(m => m.AddVisitPageComponent),
        canActivate: [doctorGuard]
    },
    {
        path: 'add-appointment',
        loadComponent: () => import('./components/add-appointment/add-appointment').then(m => m.AddAppointmentComponent),
        canActivate: [authGuard]
    },
    {
        path: 'my-leaves',
        loadComponent: () => import('./components/leaves/my-leaves/my-leaves').then(m => m.MyLeavesComponent),
        canActivate: [authGuard]
    },
    {
        path: 'appointments',
        loadComponent: () => import('./components/appointments-list/appointments-list').then(m => m.AppointmentsListComponent),
        canActivate: [authGuard]
    },
    // ── Fallback ─────────────────────────────────────────────────────────────
    {
        path: '**',
        redirectTo: ''
    }
];