// src/app/services/authenticationService.ts
//
// ─── BACKWARD-COMPATIBILITY SHIM ─────────────────────────────────────────────
//
// This file re-exports the domain types and the abstract AuthService token
// under the legacy name `AuthenticationService` so that the 20+ call sites
// across components, guards, and services do not need to change.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  Components / guards inject:  AuthenticationService                     │
// │                                     ↓                                   │
// │  DI resolves to:              FirebaseAuthService  (app.config.ts)      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// To switch auth providers:
//   1. Create a new file in src/app/repositories/<provider>/
//   2. Change the `useClass` in app.config.ts
//   3. This file (and all call sites) stay untouched.
//
export { AuthService as AuthenticationService } from './auth/auth.service';
export type { User, UserPreferences } from './auth/auth.service';