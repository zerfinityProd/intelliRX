import { Injectable, inject } from '@angular/core';
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
import { Firestore } from '@angular/fire/firestore';
import { AuthorizationService } from './authorizationService';

/**
 * User interface for the application
 * Merged from UserProfileService
 */
export interface User {
    uid: string;
    name: string;
    email: string;
    photoURL?: string;
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

    // Inject dependencies using modern inject() function
    private auth = inject(Auth);
    private firestore = inject(Firestore);
    private authorizationService = inject(AuthorizationService);

    constructor() {
        this.googleProvider = new GoogleAuthProvider();
        this.currentUserSubject = new BehaviorSubject<User | null>(null);
        this.currentUser$ = this.currentUserSubject.asObservable();

        onAuthStateChanged(this.auth, async (firebaseUser) => {
            if (firebaseUser) {
                const email = firebaseUser.email || '';
                const allowed = await this.authorizationService.isEmailAllowed(email);
                if (!allowed) {
                    await signOut(this.auth);
                    this.setCurrentUser(null);
                } else {
                    const user = this.transformFirebaseUser(firebaseUser);
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
    }

    /**
     * Handle Firebase authentication errors and map them to user-friendly messages
     * Merged from AuthErrorService
     * @param error - The Firebase authentication error object
     * @returns Error object with user-friendly message
     */
    private handleAuthError(error: any): Error {
        let message = 'An error occurred during authentication';

        switch (error.code) {
            case 'auth/email-already-in-use':
                message = 'This email is already registered';
                break;
            case 'auth/invalid-email':
                message = 'Invalid email address';
                break;
            case 'auth/operation-not-allowed':
                message = 'This operation is not allowed';
                break;
            case 'auth/weak-password':
                message = 'Password is too weak. Use at least 6 characters';
                break;
            case 'auth/user-disabled':
                message = 'This account has been disabled';
                break;
            case 'auth/user-not-found':
                message = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password';
                break;
            case 'auth/invalid-credential':
                message = 'Invalid email or password';
                break;
            case 'auth/too-many-requests':
                message = 'Too many attempts. Please try again later';
                break;
            case 'auth/network-request-failed':
                message = 'Network error. Please check your connection';
                break;
            case 'auth/popup-closed-by-user':
                message = 'Sign-in popup was closed';
                break;
            default:
                message = error.message || message;
        }

        return new Error(message);
    }

    /**
     * Check if an error is a known auth error
     * @param error - The error to check
     * @returns True if it's a Firebase auth error
     */
    private isAuthError(error: any): boolean {
        return error?.code && error.code.startsWith('auth/');
    }

    /**
     * Transform Firebase user to application User interface
     * Merged from UserProfileService
     * @param firebaseUser - Firebase user object
     * @returns Transformed User object
     */
    private transformFirebaseUser(firebaseUser: FirebaseUser): User {
        const email = firebaseUser.email || '';

        return {
            uid: firebaseUser.uid,
            name: this.extractDisplayName(firebaseUser.displayName, email),
            email,
            photoURL: firebaseUser.photoURL || undefined
        };
    }

    /**
     * Create User object from email and optional display name
     * Merged from UserProfileService
     * @param uid - Firebase user ID
     * @param email - User email
     * @param displayName - Optional display name
     * @param photoURL - Optional photo URL
     * @returns User object
     */
    private createUser(
        uid: string,
        email: string,
        displayName?: string | null,
        photoURL?: string | null
    ): User {
        return {
            uid,
            name: this.extractDisplayName(displayName, email),
            email,
            photoURL: photoURL || undefined
        };
    }

    /**
     * Extract a display name from Firebase displayName or email
     * Falls back to email prefix if displayName is not available
     * @param displayName - Firebase displayName (can be null)
     * @param email - User email (fallback)
     * @returns Display name string
     */
    private extractDisplayName(displayName: string | null | undefined, email: string): string {
        if (displayName && displayName.trim()) {
            return displayName.trim();
        }

        if (email) {
            const nameParts = email.split('@');
            return nameParts[0] || 'User';
        }

        return 'User';
    }

    /**
     * Check if a user object is valid
     * @param user - User object to validate
     * @returns True if user is valid
     */
    private isValidUser(user: any): user is User {
        return (
            user &&
            typeof user.uid === 'string' &&
            typeof user.name === 'string' &&
            typeof user.email === 'string' &&
            user.uid.trim().length > 0 &&
            user.email.trim().length > 0
        );
    }

    /**
     * Extract user ID from email (before @ symbol)
     * @param email - User email
     * @returns User ID extracted from email
     */
    private extractUserIdFromEmail(email: string): string {
        return email.split('@')[0] || 'user';
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
            const user = this.createUser(
                userCredential.user.uid,
                userCredential.user.email || email,
                displayName
            );
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

            const user = this.transformFirebaseUser(userCredential.user);
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Login error:', error);
            throw this.handleAuthError(error);
        }
    }

    async loginWithGoogle(): Promise<User> {
        try {
            const userCredential = await signInWithPopup(this.auth, this.googleProvider);
            const email = userCredential.user.email || '';

            const allowed = await this.authorizationService.isEmailAllowed(email);
            if (!allowed) {
                await signOut(this.auth);
                throw new Error('Access denied. You are not authorized to log in.');
            }

            const user = this.transformFirebaseUser(userCredential.user);
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Google login error:', error);
            throw this.handleAuthError(error);
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
