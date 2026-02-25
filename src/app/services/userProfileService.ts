import { Injectable } from '@angular/core';
import { User as FirebaseUser } from '@angular/fire/auth';

/**
 * User interface for the application
 */
export interface User {
    uid: string;
    name: string;
    email: string;
    photoURL?: string;
}

/**
 * UserProfileService
 * Handles user profile transformation and creation logic
 * Maps Firebase user objects to application User interface
 */
@Injectable({
    providedIn: 'root'
})
export class UserProfileService {

    /**
     * Transform Firebase user to application User interface
     * @param firebaseUser - Firebase user object
     * @returns Transformed User object
     */
    transformFirebaseUser(firebaseUser: FirebaseUser): User {
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
     * @param uid - Firebase user ID
     * @param email - User email
     * @param displayName - Optional display name
     * @param photoURL - Optional photo URL
     * @returns User object
     */
    createUser(
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
    isValidUser(user: any): user is User {
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
    extractUserIdFromEmail(email: string): string {
        return email.split('@')[0] || 'user';
    }
}
