import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';

/**
 * Provides Firebase Auth ID tokens for authenticating REST API requests.
 *
 * Tokens are cached in memory for 55 minutes (they expire after 60 minutes).
 * Concurrent callers during a refresh window share the same promise so only
 * one network round-trip occurs.
 */
@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private auth = inject(Auth);

  private _cachedToken: string | null = null;
  /** Epoch ms at which the cached token expires */
  private _tokenExpiry = 0;
  /** Shared promise during an in-flight refresh — deduplicates concurrent callers */
  private _tokenPromise: Promise<string | null> | null = null;

  /** 55-minute cache window (tokens last 60 min; refresh 5 min early) */
  private readonly CACHE_TTL_MS = 55 * 60 * 1_000;

  async getToken(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;

    const now = Date.now();

    // Return cached token if still valid
    if (this._cachedToken && now < this._tokenExpiry) {
      return this._cachedToken;
    }

    // Deduplicate concurrent refresh requests
    if (!this._tokenPromise) {
      this._tokenPromise = user
        .getIdToken(/* forceRefresh= */ false)
        .then(token => {
          this._cachedToken = token;
          this._tokenExpiry = Date.now() + this.CACHE_TTL_MS;
          this._tokenPromise = null;
          return token;
        })
        .catch(err => {
          this._tokenPromise = null;
          this._cachedToken = null;
          throw err;
        });
    }

    return this._tokenPromise;
  }

  /** Force-clear the cached token (call after sign-out). */
  clearCache(): void {
    this._cachedToken = null;
    this._tokenExpiry = 0;
    this._tokenPromise = null;
  }
}
