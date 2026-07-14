// src/app/repositories/firebase/firebase-auth.service.ts
//
// ─── THE ONLY FILE THAT MAY IMPORT @angular/fire/auth FOR AUTHENTICATION ──────
//
// Implements the abstract AuthService using Firebase Authentication.
// To switch to another provider (Supabase, Auth0, etc.), create a new
// implementation file and update the binding in app.config.ts.
//
import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Auth,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  deleteUser
} from '@angular/fire/auth';

import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth/auth.service';
import { AuthorizationService } from '../../services/authorizationService';
import { ClinicContextService } from '../../services/clinicContextService';

@Injectable()
export class FirebaseAuthService extends AuthService {
  private currentUserSubject: BehaviorSubject<User | null>;
  readonly currentUser$: Observable<User | null>;
  private googleProvider: GoogleAuthProvider;

  private authReadyValue = false;
  private authReadySubject = new BehaviorSubject<boolean>(false);
  readonly authReady$ = this.authReadySubject.asObservable();

  /** Set during registration to prevent onAuthStateChanged from signing out
   *  before the user document exists in the database. */
  private _registering = false;

  /** Set during login to prevent onAuthStateChanged from racing against
   *  the login method's own isEmailAllowed check. */
  private _loggingIn = false;

  private auth = inject(Auth);
  private authorizationService = inject(AuthorizationService);
  private clinicContextService = inject(ClinicContextService);
  private injector = inject(EnvironmentInjector);
  private router = inject(Router);

  constructor() {
    super();
    this.googleProvider = new GoogleAuthProvider();
    this.currentUserSubject = new BehaviorSubject<User | null>(null);
    this.currentUser$ = this.currentUserSubject.asObservable();

    onAuthStateChanged(this.auth, (firebaseUser) => {
      runInInjectionContext(this.injector, async () => {
        if (firebaseUser) {
          const email = firebaseUser.email || '';

          // While a login or registration is in progress, the login methods
          // handle user setup themselves. Skip all processing here to avoid
          // race conditions (e.g. setting up a user that will be signed out).
          if (this._loggingIn || this._registering) {
            if (!this.authReadyValue) {
              this.authReadyValue = true;
              this.authReadySubject.next(true);
            }
            return;
          }

          // Page-refresh scenario: check if this email is registered
          const allowed = await this.authorizationService.isEmailAllowed(email);
          if (!allowed) {
            console.warn('[Auth] onAuthStateChanged: email not in users collection, deleting auth user & signing out:', email);
            try { await deleteUser(firebaseUser); } catch (e) { console.warn('[Auth] Could not delete auth user:', e); }
            await signOut(this.auth);
            this.setCurrentUser(null);
            if (!this.authReadyValue) {
              this.authReadyValue = true;
              this.authReadySubject.next(true);
            }
            return;
          }

          // Fetch role and set subscription/clinic context
          const role = await this.authorizationService.getUserRole(email);
          const dbName = await this.authorizationService.getUserName(email);
          const user: User = { ...this.transformFirebaseUser(firebaseUser), role };
          if (dbName) user.name = dbName;
          this.setCurrentUser(user);
        } else {
          this.setCurrentUser(null);
        }
        if (!this.authReadyValue) {
          this.authReadyValue = true;
          this.authReadySubject.next(true);
        }
      });
    });
  }

  private handleAuthError(error: any): Error {
    let message = 'An error occurred during authentication';
    switch (error.code) {
      case 'auth/email-already-in-use': message = 'This email is already registered'; break;
      case 'auth/invalid-email': message = 'Invalid email address'; break;
      case 'auth/operation-not-allowed': message = 'This operation is not allowed'; break;
      case 'auth/weak-password': message = 'Password is too weak. Use at least 6 characters'; break;
      case 'auth/user-disabled': message = 'This account has been disabled'; break;
      case 'auth/user-not-found': message = 'No account found with this email'; break;
      case 'auth/wrong-password': message = 'Incorrect password'; break;
      case 'auth/invalid-credential': message = 'Invalid email or password'; break;
      case 'auth/too-many-requests': message = 'Too many attempts. Please try again later'; break;
      case 'auth/network-request-failed': message = 'Network error. Please check your connection'; break;
      case 'auth/popup-closed-by-user': message = 'Sign-in popup was closed'; break;
      case 'auth/cancelled-popup-request': message = 'Sign-in popup was closed'; break;
      default: message = error.message || message;
    }
    return new Error(message);
  }

  private transformFirebaseUser(firebaseUser: FirebaseUser): User {
    const email = firebaseUser.email || '';
    return {
      uid: firebaseUser.uid,
      name: this.extractDisplayName(firebaseUser.displayName, email),
      email,
      photoURL: firebaseUser.photoURL || undefined
    };
  }

  private createUser(uid: string, email: string, displayName?: string | null, photoURL?: string | null): User {
    return {
      uid,
      name: this.extractDisplayName(displayName, email),
      email,
      photoURL: photoURL || undefined
    };
  }

  private extractDisplayName(displayName: string | null | undefined, email: string): string {
    if (displayName && displayName.trim()) return displayName.trim();
    if (email) return email.split('@')[0] || 'User';
    return 'User';
  }

  get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  private setCurrentUser(user: User | null): void {
    this.currentUserSubject.next(user);
  }

  async register(email: string, password: string, displayName: string): Promise<User> {
    this._registering = true;
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
      }
      const user: User = {
        ...this.createUser(userCredential.user.uid, userCredential.user.email || email, displayName),
        role: 'subscription_owner'
      };
      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw this.handleAuthError(error);
    } finally {
      this._registering = false;
    }
  }

  async login(email: string, password: string): Promise<User> {
    this._loggingIn = true;
    // Wipe any stale session data from a previous login before starting fresh.
    sessionStorage.clear();
    try {
      // Check the users collection FIRST — if email is not registered,
      // reject immediately without touching the auth provider at all.
      const allowed = await this.authorizationService.isEmailAllowed(email);
      if (!allowed) {
        throw new Error('Access denied. Your email is not registered in the system.');
      }

      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const userEmail = userCredential.user.email || email;
      const role = await this.authorizationService.getUserRole(userEmail);
      const dbName = await this.authorizationService.getUserName(userEmail);
      const user: User = { ...this.transformFirebaseUser(userCredential.user), role };
      if (dbName) user.name = dbName;
      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      console.error('Login error:', error);
      throw this.handleAuthError(error);
    } finally {
      this._loggingIn = false;
    }
  }

  async loginWithGoogle(): Promise<User | void> {
    this._loggingIn = true;
    sessionStorage.clear();
    try {
      const result = await signInWithPopup(this.auth, this.googleProvider);
      const email = result.user.email || '';
      const allowed = await this.authorizationService.isEmailAllowed(email);
      if (!allowed) {
        try { await deleteUser(result.user); } catch (e) { console.warn('[Auth] Could not delete auth user:', e); }
        await signOut(this.auth);
        this.setCurrentUser(null);
        throw new Error('Access denied. Your email is not registered in the system.');
      }
      const role = await this.authorizationService.getUserRole(email);
      const dbName = await this.authorizationService.getUserName(email);
      const user: User = { ...this.transformFirebaseUser(result.user), role };
      if (dbName) user.name = dbName;
      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return;
      console.error('Google login error:', error);
      throw this.handleAuthError(error);
    } finally {
      this._loggingIn = false;
    }
  }

  async loginWithMicrosoft(): Promise<User | void> {
    this._loggingIn = true;
    try {
      const { OAuthProvider, signInWithPopup } = await import('@angular/fire/auth');
      const provider = new OAuthProvider('microsoft.com');
      const result = await signInWithPopup(this.auth, provider);
      const email = result.user.email || '';
      const allowed = await this.authorizationService.isEmailAllowed(email);
      if (!allowed) {
        try { await deleteUser(result.user); } catch (e) { console.warn('[Auth] Could not delete auth user:', e); }
        await signOut(this.auth);
        this.setCurrentUser(null);
        throw new Error('Access denied. Your email is not registered in the system.');
      }
      const role = await this.authorizationService.getUserRole(email);
      const dbName = await this.authorizationService.getUserName(email);
      const user: User = { ...this.transformFirebaseUser(result.user), role };
      if (dbName) user.name = dbName;
      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') return;
      console.error('Microsoft login error:', error);
      throw this.handleAuthError(error);
    } finally {
      this._loggingIn = false;
    }
  }

  async loginWithApple(): Promise<User | void> {
    this._loggingIn = true;
    try {
      const { OAuthProvider, signInWithPopup } = await import('@angular/fire/auth');
      const provider = new OAuthProvider('apple.com');
      const result = await signInWithPopup(this.auth, provider);
      const email = result.user.email || '';
      const allowed = await this.authorizationService.isEmailAllowed(email);
      if (!allowed) {
        try { await deleteUser(result.user); } catch (e) { console.warn('[Auth] Could not delete auth user:', e); }
        await signOut(this.auth);
        this.setCurrentUser(null);
        throw new Error('Access denied. Your email is not registered in the system.');
      }
      const role = await this.authorizationService.getUserRole(email);
      const dbName = await this.authorizationService.getUserName(email);
      const user: User = { ...this.transformFirebaseUser(result.user), role };
      if (dbName) user.name = dbName;
      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') return;
      console.error('Apple login error:', error);
      throw this.handleAuthError(error);
    } finally {
      this._loggingIn = false;
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw this.handleAuthError(error);
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.setCurrentUser(null);
      this.clinicContextService.clear();
      this.authorizationService.invalidateRolesCache();
      sessionStorage.clear();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  async handleGoogleRedirectResult(): Promise<User | void> {
    try {
      const result = this.auth.currentUser;
      if (!result) return;

      const email = result.email || '';
      const allowed = await this.authorizationService.isEmailAllowed(email);
      if (!allowed) {
        console.warn('[Auth] handleGoogleRedirectResult: email not registered, deleting auth user & signing out:', email);
        try { await deleteUser(result); } catch (e) { console.warn('[Auth] Could not delete auth user:', e); }
        await signOut(this.auth);
        this.setCurrentUser(null);
        return;
      }

      const role = await this.authorizationService.getUserRole(email);
      const dbName = await this.authorizationService.getUserName(email);
      const user: User = { ...this.transformFirebaseUser(result), role };
      if (dbName) user.name = dbName;
      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      console.error('Google redirect result error:', error);
      return;
    }
  }

  isLoggedIn(): boolean {
    return this.currentUserValue !== null && this.auth.currentUser !== null;
  }

  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid || null;
  }

  /**
   * Returns the signed-in user's email directly from Firebase Auth's local
   * credential cache — no database lookup required.
   */
  getAuthUserEmail(): string | null {
    return this.auth.currentUser?.email ?? null;
  }

  clearTokenCache(): void {
    // No-op for Firebase Auth: tokens are managed by the SDK itself.
    // FirebaseAuthTokenService.clearCache() handles the REST-API token cache.
  }
}
