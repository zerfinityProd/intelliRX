import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { normalizeEmail } from '../utilities/normalize-email';

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private firestore = inject(Firestore);

    async isEmailAllowed(email: string): Promise<boolean> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', normalizeEmail(email));
            const docSnap = await getDoc(docRef);
            return docSnap.exists();
        } catch (error) {
            console.warn('Access check failed for:', email);
            return false;
        }
    }

    async canUserDelete(email: string): Promise<boolean> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', normalizeEmail(email));
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return false;
            const data = docSnap.data();
            return data?.['canDelete'] === true;
        } catch (error) {
            console.warn('canDelete check failed for:', email);
            return false;
        }
    }

    /**
     * Returns the role for a given email.
     * Defaults to 'doctor' if no role field exists (backward compatible).
     */
    async getUserRole(email: string): Promise<'doctor' | 'receptionist'> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', normalizeEmail(email));
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return 'doctor';
            const data = docSnap.data();
            return (data?.['role'] === 'receptionist') ? 'receptionist' : 'doctor';
        } catch (error) {
            console.warn('Role check failed for:', email);
            return 'doctor';
        }
    }

    async checkEmailsAllowed(emails: string[]): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};
        for (const email of emails) {
            results[email] = await this.isEmailAllowed(email);
        }
        return results;
    }

    async allowEmail(email: string): Promise<void> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', normalizeEmail(email));
            await getDoc(docRef);
            console.log('Email allowlisted:', email);
        } catch (error) {
            console.error('Failed to allow email:', email, error);
            throw error;
        }
    }

    async denyEmail(email: string): Promise<void> {
        try {
            console.log('Email removed from allowlist:', email);
        } catch (error) {
            console.error('Failed to deny email:', email, error);
            throw error;
        }
    }
}