import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
    Auth,
    User as FirebaseUser,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
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

                    // Page-refresh scenario: check if this email is registered
                    const allowed = await this.authorizationService.isEmailAllowed(email);
                    if (!allowed) {
                        console.warn('[Auth] onAuthStateChanged: email not in users collection, deleting auth user & signing out:', email);
                        // Delete the orphaned Firebase Auth user so it doesn't
                        // persist in the Authentication console.
                        try { await deleteUser(firebaseUser); } catch (e) { console.warn('[Auth] Could not delete auth user:', e); }
                        await signOut(this.auth);
                        this.setCurrentUser(null);
                        if (!this.authReady) {
                            this.authReady = true;
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
            // Check Firestore FIRST — if email is not in the users collection,
            // reject immediately without touching Firebase Auth at all.
            // This prevents orphan auth-user creation for unregistered emails.
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

    /**
     * Returns the signed-in User so callers can navigate based on role.
     * Returns void (undefined) if popup was closed by user.
     */
    async loginWithGoogle(): Promise<User | void> {
        this._loggingIn = true;
        sessionStorage.clear();
        try {
            await signInWithRedirect(this.auth, this.googleProvider);
            return;
        } catch (error: any) {
            console.error('Google login error:', error);
            throw this.handleAuthError(error);
        } finally {
            this._loggingIn = false;
        }
    }

    async loginWithMicrosoft(): Promise<User | void> {
        this._loggingIn = true;
        try {
            const { OAuthProvider, signInWithRedirect } = await import('@angular/fire/auth');
            const provider = new OAuthProvider('microsoft.com');
            await signInWithRedirect(this.auth, provider);
            return;
        } catch (error: any) {
            console.error('Microsoft login error:', error);
            throw this.handleAuthError(error);
        } finally {
            this._loggingIn = false;
        }
    }

    async loginWithApple(): Promise<User | void> {
        this._loggingIn = true;
        try {
            const { OAuthProvider, signInWithRedirect } = await import('@angular/fire/auth');
            const provider = new OAuthProvider('apple.com');
            await signInWithRedirect(this.auth, provider);
            return;
        } catch (error: any) {
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
     * Handles the redirect result from Google / Microsoft / Apple OAuth.
     * Called on app load after the provider redirects back to the app.
     * Uses getRedirectResult() — the authoritative way to retrieve the
     * redirect credential, avoiding the race where auth.currentUser may
     * not yet reflect the incoming redirect at call time.
     */
    async handleGoogleRedirectResult(): Promise<User | void> {
        try {
            const redirectResult = await getRedirectResult(this.auth);
            const result = redirectResult?.user || this.auth.currentUser;
            if (!result) return;

            const email = result.email || '';
            const allowed = await this.authorizationService.isEmailAllowed(email);
            if (!allowed) {
                // User not in Firestore users collection — delete auth user & block
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