import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';

/**
 * Provides Firebase Auth ID tokens for authenticating REST API requests.
 * This is the ONLY service (besides AuthenticationService) that touches the Firebase Auth SDK.
 */
@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private auth = inject(Auth);

  /**
   * Get the current user's ID token for authenticating Firestore REST API calls.
   * Returns null if no user is signed in.
   */
  async getToken(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }
}
