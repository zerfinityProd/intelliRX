// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    // Login loaded eagerly — it's the entry point
    path: 'login',
    loadComponent: () =>
      import('./components/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./components/home/home').then(m => m.HomeComponent),
    canActivate: [authGuard]
  },
  {
    path: 'patient/:id',
    loadComponent: () =>
      import('./components/patient-details/patient-details').then(
        m => m.PatientDetailsComponent
      ),
    canActivate: [authGuard]
  },
  {
    path: 'patient/:id/add-visit',
    loadComponent: () =>
      import('./components/add-visit-page/add-visit-page').then(
        m => m.AddVisitPageComponent
      ),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];