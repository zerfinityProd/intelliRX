import { defineConfig } from 'vite';

/**
 * Vite configuration for IntelliRx.
 *
 * Firebase v11 and @angular/fire are fully ESM-compatible packages -- Vite's
 * dependency optimizer (esbuild) does NOT need to pre-bundle them.
 * Excluding them from optimizeDeps dramatically reduces esbuild worker memory
 * usage and prevents the "JS heap out of memory" crash during `ng serve`.
 */
export default defineConfig({
  optimizeDeps: {
    exclude: [
      'firebase',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'firebase/functions',
      'firebase/analytics',
      '@angular/fire',
      '@angular/fire/auth',
      '@angular/fire/firestore',
      '@angular/fire/storage',
      '@angular/fire/functions',
      '@angular/fire/analytics',
      '@angular/fire/compat',
      '@angular/fire/compat/auth',
      '@angular/fire/compat/firestore',
    ],
  },
});
