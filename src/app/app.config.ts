// src/app/app.config.ts
//
// ─── THE SINGLE PLACE WHERE ALL IMPLEMENTATIONS ARE BOUND ────────────────────
//
// To switch to another database (Supabase, PostgreSQL, REST API, etc.):
//   1. Create new implementation files in src/app/repositories/<provider>/
//   2. Replace the `useClass` values in the "Repository bindings" section below.
//   3. Update the Firebase bootstrap providers if switching auth providers.
//   4. No changes needed anywhere else in the app.
//
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  provideRouter,
  withPreloading,
  NoPreloading,
  withInMemoryScrolling,
  withComponentInputBinding
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import {
  provideAuth,
  browserPopupRedirectResolver,
  browserLocalPersistence,
  initializeAuth,
  getAuth
} from '@angular/fire/auth';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// ── Abstraction tokens ───────────────────────────────────────────────────────
import { AuthService }            from './services/auth/auth.service';
import { AuthTokenProvider }      from './services/auth/auth-token.provider';
import { PatientRepository }      from './repositories/interfaces/patient.repository';
import { AppointmentRepository }  from './repositories/interfaces/appointment.repository';
import { ClinicRepository }        from './repositories/interfaces/clinic.repository';
import { LeaveRepository }         from './repositories/interfaces/leave.repository';
import { SubscriptionRepository }  from './repositories/interfaces/subscription.repository';
import { UserRepository }          from './repositories/interfaces/user.repository';
import { ConfigRepository }        from './repositories/interfaces/config.repository';
import { PlanRepository }          from './repositories/interfaces/plan.repository';

// ── Firebase implementations ─────────────────────────────────────────────────
import { FirebaseAuthService }          from './repositories/firebase/firebase-auth.service';
import { FirebaseAuthTokenService }     from './repositories/firebase/firebase-auth-token.service';
import { FirebasePatientRepository }     from './repositories/firebase/firebase-patient.repository';
import { FirebaseAppointmentRepository } from './repositories/firebase/firebase-appointment.repository';
import { FirebaseClinicRepository }      from './repositories/firebase/firebase-clinic.repository';
import { FirebaseLeaveRepository }       from './repositories/firebase/firebase-leave.repository';
import { FirebaseSubscriptionRepository } from './repositories/firebase/firebase-subscription.repository';
import { FirebaseUserRepository }        from './repositories/firebase/firebase-user.repository';
import { FirebaseConfigRepository }      from './repositories/firebase/firebase-config.repository';
import { FirebasePlanRepository }        from './repositories/firebase/firebase-plan.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withPreloading(NoPreloading),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      withComponentInputBinding()
    ),
    provideHttpClient(),

    // ── Firebase SDK bootstrap ───────────────────────────────────────────────
    // These two providers initialise the Firebase app and Auth SDK.
    // They are only required because the Firebase implementations (below) need
    // them.  When switching providers, replace or remove these two lines.
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    // Explicitly pass browserPopupRedirectResolver so that redirect-based
    // OAuth sign-in (Google, Microsoft, Apple) works on localhost and on
    // any domain other than the default Firebase Hosting subdomain.
    // Without this, Firebase tries to load an iframe from
    // <project>.firebaseapp.com/__/auth/iframe which fails cross-origin on
    // localhost:4200, causing getRedirectResult() to return null and showing
    // the "sign-in redirect did not complete" error.
    provideAuth(() => {
      const app = getApp();
      try {
        // Explicitly pass browserPopupRedirectResolver so redirect-based OAuth
        // (Google, Microsoft, Apple) works on localhost and any non-Firebase-
        // Hosting domain. Without this, Firebase loads a cross-origin iframe
        // from <project>.firebaseapp.com/__/auth/iframe which fails on
        // localhost:4200, causing getRedirectResult() to return null.
        return initializeAuth(app, {
          persistence: browserLocalPersistence,
          popupRedirectResolver: browserPopupRedirectResolver
        });
      } catch {
        // Auth already initialized (e.g. HMR / hot reload) — reuse the instance
        return getAuth(app);
      }
    }),

    // ── Auth bindings ────────────────────────────────────────────────────────
    // Swap these two `useClass` values to migrate to a different auth provider.
    { provide: AuthService,       useClass: FirebaseAuthService },
    { provide: AuthTokenProvider, useClass: FirebaseAuthTokenService },

    // ── Repository bindings ──────────────────────────────────────────────────
    // Swap these `useClass` values to migrate to any other database.
    { provide: PatientRepository,      useClass: FirebasePatientRepository },
    { provide: AppointmentRepository,  useClass: FirebaseAppointmentRepository },
    { provide: ClinicRepository,        useClass: FirebaseClinicRepository },
    { provide: LeaveRepository,         useClass: FirebaseLeaveRepository },
    { provide: SubscriptionRepository,  useClass: FirebaseSubscriptionRepository },
    { provide: UserRepository,          useClass: FirebaseUserRepository },
    { provide: ConfigRepository,        useClass: FirebaseConfigRepository },
    { provide: PlanRepository,          useClass: FirebasePlanRepository },
  ]
};