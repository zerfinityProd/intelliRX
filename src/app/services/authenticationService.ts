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
    sendPasswordResetEmail
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
    role?: 'doctor' | 'receptionist';
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
                    const allowed = await this.authorizationService.isEmailAllowed(email);
                    if (!allowed) {
                        await signOut(this.auth);
                        this.setCurrentUser(null);
                    } else {
                        // Fetch role and set subscription/clinic context
                        const role = await this.authorizationService.getUserRole(email);
                        const subscriptionId = await this.authorizationService.getUserSubscriptionId(email);
                        const clinicIds = await this.authorizationService.getUserClinicIds(email);
                        // Set clinic context so all services can build subscription-scoped paths
                        if (subscriptionId) {
                            const currentClinic = this.clinicContextService.getSelectedClinicId();
                            const clinicId = currentClinic && clinicIds.includes(currentClinic)
                                ? currentClinic
                                : (clinicIds[0] || null);
                            this.clinicContextService.setClinicContext(clinicId, subscriptionId);
                        }
                        const user: User = { ...this.transformFirebaseUser(firebaseUser), role };
                        this.setCurrentUser(user);
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
        try {
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            if (userCredential.user) {
                await updateProfile(userCredential.user, { displayName });
            }
            const role = await this.authorizationService.getUserRole(email);
            const user: User = {
                ...this.createUser(userCredential.user.uid, userCredential.user.email || email, displayName),
                role
            };
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Registration error:', error);
            throw this.handleAuthError(error);
        }
    }

    async login(email: string, password: string): Promise<User> {
        try {
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            const userEmail = userCredential.user.email || email;
            const allowed = await this.authorizationService.isEmailAllowed(userEmail);
            if (!allowed) {
                await signOut(this.auth);
                throw new Error('Access denied. You are not authorized to log in.');
            }
            const role = await this.authorizationService.getUserRole(userEmail);
            const user: User = { ...this.transformFirebaseUser(userCredential.user), role };
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            if (error.message?.includes('Access denied')) throw error;
            console.error('Login error:', error);
            throw this.handleAuthError(error);
        }
    }

    /**
     * Returns the signed-in User so callers can navigate based on role.
     * Returns void (undefined) if popup was closed by user.
     */
    async loginWithGoogle(): Promise<User | void> {
        try {
            const result = await signInWithPopup(this.auth, this.googleProvider);
            const email = result.user.email || '';
            const allowed = await this.authorizationService.isEmailAllowed(email);
            if (!allowed) {
                await signOut(this.auth);
                throw new Error('Access denied. You are not authorized to log in.');
            }
            const role = await this.authorizationService.getUserRole(email);
            const user: User = { ...this.transformFirebaseUser(result.user), role };
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            if (error.message?.includes('Access denied')) throw error;
            if (error.code === 'auth/popup-closed-by-user') return;
            console.error('Google login error:', error);
            throw this.handleAuthError(error);
        }
    }

    async loginWithMicrosoft(): Promise<User | void> {
        try {
            const { OAuthProvider, signInWithPopup } = await import('@angular/fire/auth');
            const provider = new OAuthProvider('microsoft.com');
            const result = await signInWithPopup(this.auth, provider);
            const email = result.user.email || '';
            const allowed = await this.authorizationService.isEmailAllowed(email);
            if (!allowed) {
                await signOut(this.auth);
                throw new Error('Access denied. You are not authorized to log in.');
            }
            const role = await this.authorizationService.getUserRole(email);
            const user: User = { ...this.transformFirebaseUser(result.user), role };
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            if (error.message?.includes('Access denied')) throw error;
            if (error.code === 'auth/popup-closed-by-user') return;
            console.error('Microsoft login error:', error);
            throw this.handleAuthError(error);
        }
    }

    async loginWithApple(): Promise<User | void> {
        try {
            const { OAuthProvider, signInWithPopup } = await import('@angular/fire/auth');
            const provider = new OAuthProvider('apple.com');
            const result = await signInWithPopup(this.auth, provider);
            const email = result.user.email || '';
            const allowed = await this.authorizationService.isEmailAllowed(email);
            if (!allowed) {
                await signOut(this.auth);
                throw new Error('Access denied. You are not authorized to log in.');
            }
            const role = await this.authorizationService.getUserRole(email);
            const user: User = { ...this.transformFirebaseUser(result.user), role };
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            if (error.message?.includes('Access denied')) throw error;
            if (error.code === 'auth/popup-closed-by-user') return;
            console.error('Apple login error:', error);
            throw this.handleAuthError(error);
        }
    }

    async handleGoogleRedirectResult(): Promise<User | null> {
        return null;
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
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    isLoggedIn(): boolean {
        return this.currentUserValue !== null && this.auth.currentUser !== null;
    }

    getCurrentUserId(): string | null {
        return this.auth.currentUser?.uid || null;
    }
}