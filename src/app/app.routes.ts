// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard, doctorGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { superAdminGuard } from './guards/super-admin-guard';
import { patientContextGuard } from './guards/patient-context.guard';

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

    // ── Unified Login (All roles: Admin, Doctor, Staff, Z-Admin) ──
    {
        path: 'app/login',
        loadComponent: () => import('./components/login/login').then(m => m.LoginComponent),
    },

    // ── Clinic / Organisation Selector (shown after login when multiple workspaces exist) ──
    {
        path: 'app/select-clinic',
        loadComponent: () => import('./components/clinic-selector/clinic-selector').then(m => m.ClinicSelectorComponent),
    },

    // ── Backward compatibility: /login redirects to unified login ──
    {
        path: 'login',
        redirectTo: 'app/login',
        pathMatch: 'full'
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
    // pathMatch:'full' prevents this from swallowing /admin/* sub-paths via prefix matching
    {
        path: 'admin',
        pathMatch: 'full',
        loadComponent: () => import('./components/super-admin-dashboard/super-admin-dashboard').then(m => m.SuperAdminDashboardComponent),
        canActivate: [superAdminGuard]
    },

    // ── Admin Dashboard (subscription_owner logged via App Login) ──
    // Route alias: /admin/dashboard → same component (handles browser refresh on that URL)
    {
        path: 'admin/dashboard',
        loadComponent: () => import('./components/admin-dashboard/admin-dashboard').then(m => m.AdminDashboardComponent),
        canActivate: [adminGuard]
    },
    {
        path: 'admin-dashboard',
        loadComponent: () => import('./components/admin-dashboard/admin-dashboard').then(m => m.AdminDashboardComponent),
        canActivate: [adminGuard]
    },
    {
        path: 'admin/subscription',
        loadComponent: () => import('./components/subscription-management/subscription-management').then(m => m.SubscriptionManagementComponent),
        canActivate: [adminGuard]
    },

    // ── App Shell (Doctor/Receptionist/Owner acting as clinical staff) ──
    {
        path: 'home',
        loadComponent: () => import('./components/home/home').then(m => m.HomeComponent),
        canActivate: [authGuard]
    },
    {
        // Secure route: patient ID is passed via history.state / PatientContextService,
        // never exposed in the URL — prevents IDOR enumeration attacks.
        path: 'patient/view',
        loadComponent: () => import('./components/patient-details/patient-details').then(m => m.PatientDetailsComponent),
        canActivate: [patientContextGuard]
    },
    {
        // Secure route: patient ID is passed via history.state / PatientContextService.
        path: 'patient/add-visit',
        loadComponent: () => import('./components/add-visit-page/add-visit-page').then(m => m.AddVisitPageComponent),
        canActivate: [patientContextGuard]
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
    // ── Subscription Expired (accessible without auth — user is logged out) ──
    {
        path: 'subscription-expired',
        loadComponent: () => import('./components/subscription-expired/subscription-expired').then(m => m.SubscriptionExpiredComponent),
    },
    // ── Fallback ─────────────────────────────────────────────────────────────
    {
        path: '**',
        redirectTo: ''
    }
];