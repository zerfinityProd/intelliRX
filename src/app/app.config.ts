// src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  provideRouter,
  withPreloading,
  NoPreloading,
  withInMemoryScrolling,
  withComponentInputBinding
} from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      // Load lazy chunks only on demand — avoids unused JS penalised by Lighthouse
      withPreloading(NoPreloading),
      // Restore scroll position on back navigation
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      // Bind route params directly to component @Input()
      withComponentInputBinding()
    ),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore())
  ]
};