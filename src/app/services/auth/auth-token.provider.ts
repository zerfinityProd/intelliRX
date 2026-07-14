// src/app/services/auth/auth-token.provider.ts
//
// ─── AUTH TOKEN ABSTRACTION ───────────────────────────────────────────────────
//
// Provides a bearer token for authenticating outbound API calls (e.g. the
// Firestore REST API used by FirestoreApiService).
//
// The concrete implementation is Firebase-specific
// (src/app/repositories/firebase/firebase-auth-token.service.ts).
// When switching providers this is the ONLY file that needs a new implementation.
//
export abstract class AuthTokenProvider {
  /**
   * Returns a valid bearer token for the currently signed-in user, or null
   * if no user is signed in.  Implementations should cache the token to avoid
   * unnecessary network round-trips.
   */
  abstract getToken(): Promise<string | null>;

  /** Force-clear any cached token (e.g. after sign-out). */
  abstract clearCache(): void;
}
