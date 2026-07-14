// src/main.ts
import 'zone.js';  // <-- ADD THIS LINE AT THE TOP

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

// Suppress known harmless console noise from auth provider SDK internals.
const originalError = console.error;
const originalWarn = console.warn;
const suppressionPatterns = [
  'Cross-Origin-Opener-Policy',
  'cross-origin-opener-policy',
  'window.closed',
];
const shouldSuppress = (args: any[]): boolean => {
  const combined = args.map(a => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.message;
    try { return String(a); } catch { return ''; }
  }).join(' ');
  return suppressionPatterns.some(p => combined.includes(p));
};
const noiseFilter = (original: (...args: any[]) => void) => (...args: any[]) => {
  if (shouldSuppress(args)) return;
  original.apply(console, args);
};
console.error = noiseFilter(originalError);
console.warn = noiseFilter(originalWarn);

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));