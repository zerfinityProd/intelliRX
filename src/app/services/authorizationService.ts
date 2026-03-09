import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private firestore = inject(Firestore);

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

    async canUserDelete(email: string): Promise<boolean> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', email.toLowerCase());
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return false;
            const data = docSnap.data();
            return data?.['canDelete'] === true;
        } catch (error) {
            console.warn('canDelete check failed for:', email);
            return false;
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
            const docRef = doc(this.firestore, 'allowedUsers', email.toLowerCase());
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