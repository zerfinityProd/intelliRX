// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { HomeComponent } from './components/home/home';
import { PatientDetailsComponent } from './components/patient-details/patient-details';

import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [authGuard]
  },
 
  {
    path: 'patient/:id',
    component: PatientDetailsComponent,
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];