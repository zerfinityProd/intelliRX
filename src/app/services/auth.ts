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
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

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

  private authReady = false;
  private authReadySubject = new BehaviorSubject<boolean>(false);
  public authReady$ = this.authReadySubject.asObservable();

  constructor(private auth: Auth, private firestore: Firestore) {
    this.googleProvider = new GoogleAuthProvider();
    this.currentUserSubject = new BehaviorSubject<User | null>(null);
    this.currentUser$ = this.currentUserSubject.asObservable();

    onAuthStateChanged(this.auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        const allowed = await this.isEmailAllowedInFirestore(email);
        if (!allowed) {
          await signOut(this.auth);
          this.setCurrentUser(null);
        } else {
          const user: User = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || email.split('@')[0] || 'User',
            email,
            photoURL: firebaseUser.photoURL || undefined
          };
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
   * Check Firestore allowedUsers collection.
   * Add users in Firebase Console → Firestore → allowedUsers → Add document
   * Document ID = the user's email (e.g. user@example.com)
   */
  private async isEmailAllowedInFirestore(email: string): Promise<boolean> {
    try {
      const docRef = doc(this.firestore, 'allowedUsers', email.toLowerCase());
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.warn('Access check failed for:', email);
      return false;
    }
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

  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const userEmail = userCredential.user.email || email;

      const allowed = await this.isEmailAllowedInFirestore(userEmail);
      if (!allowed) {
        await signOut(this.auth);
        throw new Error('Access denied. You are not authorized to log in.');
      }

      const user: User = {
        uid: userCredential.user.uid,
        name: userCredential.user.displayName || userEmail.split('@')[0] || 'User',
        email: userEmail,
        photoURL: userCredential.user.photoURL || undefined
      };
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

      const allowed = await this.isEmailAllowedInFirestore(email);
      if (!allowed) {
        await signOut(this.auth);
        throw new Error('Access denied. You are not authorized to log in.');
      }

      const user: User = {
        uid: userCredential.user.uid,
        name: userCredential.user.displayName || email.split('@')[0] || 'User',
        email,
        photoURL: userCredential.user.photoURL || undefined
      };
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
      default: message = error.message || message;
    }
    return new Error(message);
  }
}