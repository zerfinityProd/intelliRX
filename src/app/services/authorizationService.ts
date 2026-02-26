import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

/**
 * AuthorizationService
 * Handles user authorization and permission checks
 * Manages allowlist validation and access control
 */
@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private firestore = inject(Firestore);

    /**
     * Check if a user email is allowed to access the application
     * Validates against the allowedUsers collection in Firestore
     *
     * Setup: Add users in Firebase Console → Firestore → allowedUsers → Add document
     * Document ID = the user's email (e.g. user@example.com)
     *
     * @param email - User email to check
     * @returns Promise<boolean> - True if user is allowed, false otherwise
     */
    async isEmailAllowed(email: string): Promise<boolean> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', email.toLowerCase());
            const docSnap = await getDoc(docRef);
            return docSnap.exists();
        } catch (error) {
            console.warn('Access check failed for:', email);
            return false;
        }
    }

    /**
     * Check if multiple emails are allowed
     * @param emails - Array of emails to check
     * @returns Promise<Record<string, boolean>> - Map of email -> allowed status
     */
    async checkEmailsAllowed(emails: string[]): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};

        for (const email of emails) {
            results[email] = await this.isEmailAllowed(email);
        }

        return results;
    }

    /**
     * Add an email to the allowlist (admin function)
     * @param email - Email to allow
     * @returns Promise<void>
     */
    async allowEmail(email: string): Promise<void> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', email.toLowerCase());
            await getDoc(docRef);
            // In a real app, you'd use setDoc here
            // For now, this is a placeholder for admin functionality
            console.log('Email allowlisted:', email);
        } catch (error) {
            console.error('Failed to allow email:', email, error);
            throw error;
        }
    }

    /**
     * Remove an email from the allowlist (admin function)
     * @param email - Email to deny
     * @returns Promise<void>
     */
    async denyEmail(email: string): Promise<void> {
        try {
            // In a real app, you'd use deleteDoc here
            // For now, this is a placeholder for admin functionality
            console.log('Email removed from allowlist:', email);
        } catch (error) {
            console.error('Failed to deny email:', email, error);
            throw error;
        }
    }
}
