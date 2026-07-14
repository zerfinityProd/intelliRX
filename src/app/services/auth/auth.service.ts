// src/app/services/auth/auth.service.ts
//
// ─── AUTHENTICATION ABSTRACTION ──────────────────────────────────────────────
//
// This abstract class is the ONLY authentication token the rest of the app
// should inject.  It is completely database/provider-agnostic.
//
// To switch auth providers (Firebase → Supabase, Auth0, etc.):
//   1. Create a new implementation in src/app/repositories/<provider>/
//   2. Update the `provide: AuthService` binding in app.config.ts
//   3. No changes needed anywhere else.
//
import { BehaviorSubject, Observable } from 'rxjs';

// ── Domain models ─────────────────────────────────────────────────────────────

export interface UserPreferences {
  theme: 'light' | 'dark';
}

export interface User {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role?: string;
  preferences?: UserPreferences;
}

// ── Abstract token ─────────────────────────────────────────────────────────────

export abstract class AuthService {
  // ── Reactive state ──────────────────────────────────────────────────────────

  abstract readonly currentUser$: Observable<User | null>;

  /**
   * Emits true once the underlying auth provider has finished its initial
   * state-restore (e.g. page-refresh scenario).  Guards must wait for this
   * before deciding whether the user is logged in.
   */
  abstract readonly authReady$: Observable<boolean>;

  // ── Synchronous accessors ──────────────────────────────────────────────────

  abstract get currentUserValue(): User | null;

  abstract isLoggedIn(): boolean;

  abstract getCurrentUserId(): string | null;

  /**
   * Returns the signed-in user's email directly from the auth provider's
   * local credential cache — no database lookup required.
   * Use when you need the email before the full auth pipeline has finished.
   */
  abstract getAuthUserEmail(): string | null;

  // ── Auth operations ────────────────────────────────────────────────────────

  abstract register(
    email: string,
    password: string,
    displayName: string
  ): Promise<User>;

  abstract login(email: string, password: string): Promise<User>;

  abstract loginWithGoogle(): Promise<User | void>;

  abstract loginWithMicrosoft(): Promise<User | void>;

  abstract loginWithApple(): Promise<User | void>;

  abstract resetPassword(email: string): Promise<void>;

  abstract logout(): Promise<void>;

  abstract handleGoogleRedirectResult(): Promise<User | void>;

  // ── Invalidation helpers ───────────────────────────────────────────────────

  /**
   * Called by AuthorizationService after sign-out to allow the auth
   * implementation to flush any cached tokens.
   */
  abstract clearTokenCache(): void;
}
