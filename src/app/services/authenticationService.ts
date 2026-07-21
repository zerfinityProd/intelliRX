import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
    Auth,
    User as FirebaseUser,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    OAuthProvider,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail,
    deleteUser,
    sendEmailVerification
} from '@angular/fire/auth';

import { Router } from '@angular/router';
import { AuthorizationService } from './authorizationService';
import { ClinicContextService } from './clinicContextService';

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

@Injectable({
    providedIn: 'root'
})
export class AuthenticationService {
    private currentUserSubject: BehaviorSubject<User | null>;
    public currentUser$: Observable<User | null>;
    private googleProvider: GoogleAuthProvider;

    private authReady = false;
    private authReadySubject = new BehaviorSubject<boolean>(false);
    public authReady$ = this.authReadySubject.asObservable();

    /** Set during registration to prevent onAuthStateChanged from signing out
     *  before the user document exists in Firestore. */
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
                        if (!this.authReady) {
                            this.authReady = true;
                            this.authReadySubject.next(true);
                        }
                        return;
                    }

                    // Page-refresh scenario: attempt to enrich the user with
                    // Firestore role/name data. This is best-effort — if Firestore
                    // is slow or unavailable we MUST NOT sign the user out or delete
                    // their account, because isEmailAllowed() may return false simply
                    // due to a timed-out HTTP request (lookupUser swallows errors and
                    // returns {role:null}, making isEmailAllowed return false).
                    // Authorization (admin role check) is handled separately by the
                    // route guard, which will redirect non-admins to /home.
                    try {
                        const allowed = await this.authorizationService.isEmailAllowed(email);
                        if (allowed) {
                            const role = await this.authorizationService.getUserRole(email);
                            const dbName = await this.authorizationService.getUserName(email);
                            const user: User = { ...this.transformFirebaseUser(firebaseUser), role };
                            if (dbName) user.name = dbName;
                            this.setCurrentUser(user);
                        } else {
                            // isEmailAllowed returned false — this could be a genuine
                            // "orphan auth user" OR a Firestore timeout.
                            // Either way, do NOT sign out on page refresh — the guard
                            // will redirect non-admin users to /home safely.
                            // Set basic user data so the app can at least render.
                            console.warn('[Auth] isEmailAllowed=false on page-refresh for', email,
                                '— using basic token data (guard will redirect if not authorized)');
                            this.setCurrentUser(this.transformFirebaseUser(firebaseUser));
                        }
                    } catch (e) {
                        console.warn('[Auth] onAuthStateChanged page-refresh check failed — proceeding with basic user data:', e);
                        // Firestore unavailable / timed out — set user from Firebase token
                        // data so the app is usable. The guard handles authorization.
                        this.setCurrentUser(this.transformFirebaseUser(firebaseUser));
                    }
                } else {
                    this.setCurrentUser(null);
                }
                if (!this.authReady) {
                    this.authReady = true;
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

    public get currentUserValue(): User | null {
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
            // During registration the user doc doesn't exist yet, so
            // getUserRole will return the default 'doctor'. The caller
            // (register-wizard) will set the proper role in the Firestore
            // user document after this method returns.
            const user: User = {
                ...this.createUser(userCredential.user.uid, userCredential.user.email || email, displayName),
                role: 'subscription_owner'
            };
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Registration error:', error);
            throw this.handleAuthError(error);
        }
        // NOTE: We no longer set this._registering = false in a finally block here.
        // It is managed externally by the register-wizard to prevent premature deletion 
        // during the email verification pause.
    }

    /**
     * Manually controls the registering state flag.
     * Prevents onAuthStateChanged from prematurely deleting a user during long-running
     * registration flows like email verification.
     */
    setRegistering(isRegistering: boolean) {
        this._registering = isRegistering;
    }

    async login(email: string, password: string): Promise<User> {
        this._loggingIn = true;
        // Wipe any stale session data from a previous login before starting fresh.
        sessionStorage.clear();
        try {
            // Sign in with Firebase FIRST so auth.currentUser is set.
            // isEmailAllowed() is called afterwards with a valid token — the
            // users collection requires request.auth != null, so we must be
            // signed in before querying Firestore.
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);

            // Now check if this email is registered in our users collection.
            // If not, immediately revoke the newly created Firebase Auth session.
            const userEmail = userCredential.user.email || email;
            const allowed = await this.authorizationService.isEmailAllowed(userEmail);
            if (!allowed) {
                console.warn('[Auth] email/password login: email not in users collection, signing out:', userEmail);
                try { await signOut(this.auth); } catch { /* ignore */ }
                this.setCurrentUser(null);
                throw new Error('Access denied. Your email is not registered in the system. Please contact your administrator.');
            }

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

    /**
     * Signs in with Google via popup.
     * Returns the signed-in User, or void if the popup was closed by the user.
     */
    async loginWithGoogle(): Promise<User | void> {
        this._loggingIn = true;
        try {
            const credential = await signInWithPopup(this.auth, this.googleProvider);
            return await this._buildUserFromFirebase(credential.user);
        } catch (error: any) {
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                return;
            }
            console.error('Google login error:', error);
            throw this.handleAuthError(error);
        } finally {
            this._loggingIn = false;
        }
    }

    async loginWithMicrosoft(): Promise<User | void> {
        this._loggingIn = true;
        try {
            const provider = new OAuthProvider('microsoft.com');
            const credential = await signInWithPopup(this.auth, provider);
            return await this._buildUserFromFirebase(credential.user);
        } catch (error: any) {
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                return;
            }
            console.error('Microsoft login error:', error);
            throw this.handleAuthError(error);
        } finally {
            this._loggingIn = false;
        }
    }

    async loginWithApple(): Promise<User | void> {
        this._loggingIn = true;
        try {
            const provider = new OAuthProvider('apple.com');
            const credential = await signInWithPopup(this.auth, provider);
            return await this._buildUserFromFirebase(credential.user);
        } catch (error: any) {
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                return;
            }
            console.error('Apple login error:', error);
            throw this.handleAuthError(error);
        } finally {
            this._loggingIn = false;
        }
    }

    /** Shared helper: checks isEmailAllowed, fetches role/name, sets currentUser. */
    private async _buildUserFromFirebase(firebaseUser: FirebaseUser): Promise<User> {
        const email = firebaseUser.email || '';
        const allowed = await this.authorizationService.isEmailAllowed(email);
        if (!allowed) {
            console.warn('[Auth] popup sign-in: email not registered, signing out:', email);
            try { await deleteUser(firebaseUser); } catch { /* ignore */ }
            await signOut(this.auth);
            this.setCurrentUser(null);
            throw new Error('Access denied. Your email is not registered in the system. Please contact your administrator.');
        }
        const role = await this.authorizationService.getUserRole(email);
        const dbName = await this.authorizationService.getUserName(email);
        const user: User = { ...this.transformFirebaseUser(firebaseUser), role };
        if (dbName) user.name = dbName;
        this.setCurrentUser(user);
        return user;
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
            // Clear the stored clinic so the next login always prompts
            // when the user has multiple subscriptions/clinics.
            this.clinicContextService.clear();
            // Clear the authorization lookup cache so the next login fetches
            // fresh assignments from Firestore (avoids stale-cache bug where
            // only the cached subscription is returned, hiding others).
            this.authorizationService.invalidateRolesCache();
            // Clear ALL session-persisted app state (search terms, form drafts,
            // visit data, day-view dates, etc.) so no previous user's data leaks
            // into the next session after a fresh login.
            sessionStorage.clear();
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    /**
     * No-op: OAuth sign-in now uses signInWithPopup, so there is no redirect
     * result to handle. Kept for interface compatibility only.
     */
    async handleGoogleRedirectResult(): Promise<User | void> {
        return;
    }

    isLoggedIn(): boolean {
        return this.currentUserValue !== null && this.auth.currentUser !== null;
    }

    getCurrentUserId(): string | null {
        return this.auth.currentUser?.uid || null;
    }

    /**
     * Returns the signed-in user's email directly from Firebase Auth.
     * This is available immediately from the local credential cache —
     * no Firestore lookup required. Use this when you need the email
     * before the full auth pipeline (role/name fetching) has finished.
     */
    getFirebaseUserEmail(): string | null {
        return this.auth.currentUser?.email ?? null;
    }

    /**
     * Sends a verification email to the current authenticated Firebase user.
     */
    async sendVerificationEmail(): Promise<void> {
        if (!this.auth.currentUser) throw new Error('No user is currently signed in.');
        try {
            await sendEmailVerification(this.auth.currentUser);
        } catch (error: any) {
            console.error('Send verification email error:', error);
            throw this.handleAuthError(error);
        }
    }

    /**
     * Reloads the current user from Firebase to get updated properties (e.g. emailVerified).
     * Returns true if the email is verified, false otherwise.
     */
    async reloadCurrentUser(): Promise<boolean> {
        if (!this.auth.currentUser) return false;
        try {
            await this.auth.currentUser.reload();
            return this.auth.currentUser.emailVerified;
        } catch (error: any) {
            console.error('Reload user error:', error);
            return false;
        }
    }
}