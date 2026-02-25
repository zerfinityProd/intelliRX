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
import { UserProfileService, User } from './userProfileService';
import { AuthErrorService } from './authErrorService';
import { AuthorizationService } from './authorizationService';

// Re-export User interface for backward compatibility
export type { User };

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
    private userProfileService = inject(UserProfileService);
    private authErrorService = inject(AuthErrorService);
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
                    const user = this.userProfileService.transformFirebaseUser(firebaseUser);
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
            const user = this.userProfileService.createUser(
                userCredential.user.uid,
                userCredential.user.email || email,
                displayName
            );
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Registration error:', error);
            throw this.authErrorService.handleAuthError(error);
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

            const user = this.userProfileService.transformFirebaseUser(userCredential.user);
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Login error:', error);
            throw this.authErrorService.handleAuthError(error);
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

            const user = this.userProfileService.transformFirebaseUser(userCredential.user);
            this.setCurrentUser(user);
            return user;
        } catch (error: any) {
            console.error('Google login error:', error);
            throw this.authErrorService.handleAuthError(error);
        }
    }

    async resetPassword(email: string): Promise<void> {
        try {
            await sendPasswordResetEmail(this.auth, email);
        } catch (error: any) {
            console.error('Password reset error:', error);
            throw this.authErrorService.handleAuthError(error);
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
