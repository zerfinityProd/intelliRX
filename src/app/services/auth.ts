import { Injectable } from '@angular/core';
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

export interface User {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser$: Observable<User | null>;
  private googleProvider: GoogleAuthProvider;

  constructor(private auth: Auth) {
    this.googleProvider = new GoogleAuthProvider();
    
    // Initialize from localStorage for persistence
    const storedUser = localStorage.getItem('currentUser');
    this.currentUserSubject = new BehaviorSubject<User | null>(
      storedUser ? JSON.parse(storedUser) : null
    );
    this.currentUser$ = this.currentUserSubject.asObservable();

    // Listen to Firebase auth state changes
    onAuthStateChanged(this.auth, (firebaseUser) => {
      if (firebaseUser) {
        const user: User = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || undefined
        };
        this.setCurrentUser(user);
      } else {
        this.setCurrentUser(null);
      }
    });
  }

  /**
   * Get current user value
   */
  public get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Set current user and persist to localStorage
   */
  private setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
    this.currentUserSubject.next(user);
  }

  /**
   * Register new user with email and password
   */
  async register(email: string, password: string, displayName: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      
      // Update user profile with display name
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
      }

      const user: User = {
        uid: userCredential.user.uid,
        name: displayName,
        email: userCredential.user.email || email,
        photoURL: userCredential.user.photoURL || undefined
      };

      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw this.handleAuthError(error);
    }
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      
      const user: User = {
        uid: userCredential.user.uid,
        name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
        email: userCredential.user.email || email,
        photoURL: userCredential.user.photoURL || undefined
      };

      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      console.error('Login error:', error);
      throw this.handleAuthError(error);
    }
  }

  /**
   * Login with Google
   */
  async loginWithGoogle(): Promise<User> {
    try {
      const userCredential = await signInWithPopup(this.auth, this.googleProvider);
      
      const user: User = {
        uid: userCredential.user.uid,
        name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
        email: userCredential.user.email || '',
        photoURL: userCredential.user.photoURL || undefined
      };

      this.setCurrentUser(user);
      return user;
    } catch (error: any) {
      console.error('Google login error:', error);
      throw this.handleAuthError(error);
    }
  }

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw this.handleAuthError(error);
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.setCurrentUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return this.currentUserValue !== null && this.auth.currentUser !== null;
  }

  /**
   * Get current Firebase user ID (for database queries)
   */
  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid || null;
  }

  /**
   * Handle Firebase auth errors
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
}