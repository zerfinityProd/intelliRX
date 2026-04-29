// src/main.ts
import 'zone.js';  // <-- ADD THIS LINE AT THE TOP

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

// Suppress Firebase Auth SDK's internal Cross-Origin-Opener-Policy warnings.
// These are harmless browser-level errors from Firebase's hidden auth iframes
// and cannot be fixed from application code.
const originalError = console.error;
const originalWarn = console.warn;
const coopFilter = (original: (...args: any[]) => void) => (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Cross-Origin-Opener-Policy')) return;
  original.apply(console, args);
};
console.error = coopFilter(originalError);
console.warn = coopFilter(originalWarn);

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));