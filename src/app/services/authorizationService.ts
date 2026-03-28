import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { normalizeEmail } from '../utilities/normalize-email';

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private firestore = inject(Firestore);

    private toClinicIds(value: any): string[] {
        // Accept: string[] | string | [{id: string}] | {id: string}
        if (!value) return [];
        if (Array.isArray(value)) {
            const ids: string[] = [];
            for (const item of value) {
                if (typeof item === 'string') ids.push(item);
                else if (item && typeof item === 'object') {
                    const id = (item.id ?? item.clinicId ?? item.clinic_id ?? item._id);
                    if (typeof id === 'string' && id.trim()) ids.push(id.trim());
                }
            }
            return ids.filter(Boolean);
        }

        if (typeof value === 'string') return [value];
        if (typeof value === 'object') {
            const id = (value.id ?? value.clinicId ?? value.clinic_id ?? value._id);
            return (typeof id === 'string' && id.trim()) ? [id.trim()] : [];
        }

        return [];
    }

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

    /**
     * SaaS scoping: list of clinic ids a user (doctor/receptionist) can access.
     * Data is expected in `allowedUsers/{email}`.
     *
     * Backward compatible behavior:
     * - if `clinicIds` / `clinicId` is missing -> returns [] (callers decide fallback)
     * - if only `subscriptionId` is present -> tries to read `subscriptions/{subscriptionId}`
     *   and derive `clinicId`/`clinicIds` from there.
     */
    async getUserClinicIds(email: string): Promise<string[]> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', normalizeEmail(email));
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return [];

            const data = docSnap.data() as any;

            const clinicIds = [
                ...this.toClinicIds(data?.clinicIds),
                ...this.toClinicIds(data?.clinicId),
                ...this.toClinicIds(data?.clinics),
                ...this.toClinicIds(data?.clinic)
            ];

            const uniqueClinicIds = Array.from(new Set(clinicIds)).filter(Boolean);
            if (uniqueClinicIds.length) return uniqueClinicIds;

            // Fallback: derive clinic(s) from the subscription.
            const subscriptionId =
                data?.subscriptionId ??
                data?.subscription_id ??
                (typeof data?.subscription === 'object' ? (data.subscription.id ?? data.subscription.subscriptionId) : undefined) ??
                (typeof data?.plan === 'object' ? (data.plan.id ?? data.plan.subscriptionId) : undefined) ??
                data?.planId;
            if (!subscriptionId) return [];

            const subscriptionRef = doc(this.firestore, 'subscriptions', String(subscriptionId));
            const subscriptionSnap = await getDoc(subscriptionRef);
            if (!subscriptionSnap.exists()) return [];

            const subData = subscriptionSnap.data() as any;
            const derived = [
                ...this.toClinicIds(subData?.clinicIds),
                ...this.toClinicIds(subData?.clinicId),
                ...this.toClinicIds(subData?.clinics),
                ...this.toClinicIds(subData?.clinic)
            ];
            return Array.from(new Set(derived)).filter(Boolean);
        } catch (error) {
            console.warn('getUserClinicIds failed for:', email, error);
            return [];
        }
    }

    /**
     * SaaS scoping: subscription id for a user.
     * Data is expected in `allowedUsers/{email}` as `subscriptionId`.
     */
    async getUserSubscriptionId(email: string): Promise<string | null> {
        try {
            const docRef = doc(this.firestore, 'allowedUsers', normalizeEmail(email));
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return null;

            const data = docSnap.data() as any;
            const subscriptionId =
                data?.subscriptionId ??
                data?.subscription_id ??
                (typeof data?.subscription === 'object' ? (data.subscription.id ?? data.subscription.subscriptionId) : undefined) ??
                (typeof data?.plan === 'object' ? (data.plan.id ?? data.plan.subscriptionId) : undefined) ??
                data?.planId;
            return subscriptionId ? String(subscriptionId) : null;
        } catch (error) {
            console.warn('getUserSubscriptionId failed for:', email, error);
            return null;
        }
    }
}