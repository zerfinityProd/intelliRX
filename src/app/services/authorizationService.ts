import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, collection, getDocs } from '@angular/fire/firestore';
import { normalizeEmail } from '../utilities/normalize-email';

interface RolesCache {
    doctorEmails: string[];
    receptionistEmails: string[];
    timestamp: number;
}

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private firestore = inject(Firestore);

    /** In-memory cache for the roles collection (refreshed every 5 minutes) */
    private rolesCache: RolesCache | null = null;
    private readonly ROLES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

    /**
     * Fetch and cache the roles collection.
     * Reads `roles/doctor` and `roles/receptionist`, each having an `emails` array.
     */
    private async loadRoles(): Promise<RolesCache> {
        if (this.rolesCache && (Date.now() - this.rolesCache.timestamp < this.ROLES_CACHE_TTL)) {
            return this.rolesCache;
        }

        let doctorEmails: string[] = [];
        let receptionistEmails: string[] = [];

        try {
            const doctorDoc = await getDoc(doc(this.firestore, 'roles', 'doctor'));
            if (doctorDoc.exists()) {
                const data = doctorDoc.data();
                const emails = data?.['emails'];
                if (Array.isArray(emails)) {
                    doctorEmails = emails.map((e: any) => normalizeEmail(String(e)));
                }
            }
        } catch (error) {
            console.error('Failed to load doctor roles (possible Firestore rules issue):', error);
        }

        try {
            const receptionistDoc = await getDoc(doc(this.firestore, 'roles', 'receptionist'));
            if (receptionistDoc.exists()) {
                const data = receptionistDoc.data();
                const emails = data?.['emails'];
                if (Array.isArray(emails)) {
                    receptionistEmails = emails.map((e: any) => normalizeEmail(String(e)));
                }
            }
        } catch (error) {
            console.error('Failed to load receptionist roles (possible Firestore rules issue):', error);
        }

        console.log('Loaded roles – doctors:', doctorEmails.length, ', receptionists:', receptionistEmails.length);
        this.rolesCache = { doctorEmails, receptionistEmails, timestamp: Date.now() };
        return this.rolesCache;
    }

    /** Force refresh the roles cache (e.g. after admin changes) */
    invalidateRolesCache(): void {
        this.rolesCache = null;
    }

    /**
     * Check if an email is allowed.
     * First checks the `roles` collection (doctor / receptionist emails).
     * Falls back to `allowedUsers/{email}` document existence for backward compatibility.
     */
    async isEmailAllowed(email: string): Promise<boolean> {
        try {
            const normalized = normalizeEmail(email);

            // Primary check – roles collection
            const roles = await this.loadRoles();
            if (roles.doctorEmails.includes(normalized) ||
                roles.receptionistEmails.includes(normalized)) {
                return true;
            }

            // Fallback – allowedUsers document
            try {
                const userDoc = await getDoc(doc(this.firestore, 'allowedUsers', normalized));
                if (userDoc.exists()) {
                    console.log('Email found in allowedUsers (not in roles):', normalized);
                    return true;
                }
            } catch (fallbackErr) {
                console.warn('allowedUsers fallback check failed:', fallbackErr);
            }

            console.warn('Email not found in roles or allowedUsers:', normalized);
            return false;
        } catch (error) {
            console.warn('Access check failed for:', email, error);
            return false;
        }
    }

    /**
     * Check if a user has delete permissions.
     * Still reads from `allowedUsers/{email}` for per-user settings.
     */
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
     * Reads from `roles/doctor` and `roles/receptionist` collections.
     * Defaults to 'doctor' if email is not found in either role.
     */
    async getUserRole(email: string): Promise<'doctor' | 'receptionist'> {
        try {
            const normalized = normalizeEmail(email);
            const roles = await this.loadRoles();
            if (roles.receptionistEmails.includes(normalized)) return 'receptionist';
            return 'doctor';
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
     * Still reads from `allowedUsers/{email}` for per-user settings.
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
     * Still reads from `allowedUsers/{email}` for per-user settings.
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