import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, doc, getDoc, updateDoc, deleteField } from '@angular/fire/firestore';
import { normalizeEmail } from '../utilities/normalize-email';

/** Strip non-printable / invisible characters from a string */
function stripInvisible(s: string): string {
    return s.replace(/[^\x20-\x7E]/g, '').trim();
}

export interface UserPermissions {
    canDelete: boolean;
    canEdit: boolean;
    canAddPatient: boolean;
    canAddVisit: boolean;
    canAppointment: boolean;
    canCancel: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
    canDelete: false,
    canEdit: false,
    canAddPatient: false,
    canAddVisit: false,
    canAppointment: false,
    canCancel: false,
};

/** Known role names */
const KNOWN_ROLES: string[] = ['doctor', 'receptionist'];

/**
 * Cached result from the users + clinic_users lookup.
 */
interface UserLookupResult {
    userId: string;
    subscriptionId: string;
    clinicIds: string[];
    role: 'doctor' | 'receptionist';
    /** Per-user permission overrides (if present on the user doc) */
    userPermissionOverrides: string[] | null;
    timestamp: number;
}

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private firestore = inject(Firestore);

    /** Per-email lookup cache */
    private lookupCache = new Map<string, UserLookupResult>();
    /** Global role defaults cache: roleName → permissions */
    private roleDefaultsCache = new Map<string, string[]>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /** Force refresh the cache */
    invalidateRolesCache(): void {
        this.lookupCache.clear();
        this.roleDefaultsCache.clear();
    }

    /**
     * Core lookup: find user doc in top-level `users` collection,
     * then find associated clinic_users entries.
     *
     * users/{user_id}: { email, name, global_roles, status }
     * clinic_users/{cu_id}: { subscription_id, clinic_id, user_id, roles, availability, status }
     */
    private async lookupUser(email: string): Promise<UserLookupResult | null> {
        const normalized = normalizeEmail(email);

        // Check cache
        const cached = this.lookupCache.get(normalized);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            return cached;
        }

        try {
            // Step 1: Find user in top-level users collection by email
            const usersCol = collection(this.firestore, 'users');
            const userQuery = query(usersCol, where('email', '==', normalized));
            let userSnapshot = await getDocs(userQuery);

            // Fallback: if where-query returned 0 docs, fetch all and match client-side.
            // This handles cases where Firestore field keys have invisible characters,
            // security rules silently block the query, or field name casing differs.
            if (userSnapshot.empty) {
                console.warn('[AuthZ] where-query returned 0 docs for', normalized, '— trying client-side fallback');
                const allUsersSnap = await getDocs(usersCol);
                console.log('[AuthZ] Fetched', allUsersSnap.size, 'docs from users collection for fallback');

                let corruptedKey: string | null = null;
                const matchedDoc = allUsersSnap.docs.find(d => {
                    const data = d.data();
                    for (const key of Object.keys(data)) {
                        if (typeof data[key] !== 'string') continue;
                        // Compare after stripping invisible chars from BOTH the stored value and the search email
                        const cleanValue = stripInvisible(data[key]).toLowerCase();
                        if (cleanValue === normalized) {
                            // Track which key held the email so we can auto-fix it
                            const cleanKey = stripInvisible(key).toLowerCase();
                            if (cleanKey === 'email' && key !== 'email') {
                                corruptedKey = key;
                            }
                            console.log('[AuthZ] Fallback matched doc', d.id, 'via key', JSON.stringify(key));
                            return true;
                        }
                    }
                    return false;
                });

                if (!matchedDoc) {
                    // Log detailed diagnostics for debugging
                    console.warn('[AuthZ] User not found in users collection (even with fallback):', normalized);
                    allUsersSnap.docs.forEach(d => {
                        const data = d.data();
                        const keys = Object.keys(data);
                        const emailLikeValues = keys
                            .filter(k => typeof data[k] === 'string' && data[k].includes('@'))
                            .map(k => `${JSON.stringify(k)}=${JSON.stringify(data[k])}`);
                        console.warn('[AuthZ]   doc', d.id, 'email-like fields:', emailLikeValues.join(', ') || '(none)');
                    });
                    return null;
                }

                // Auto-fix corrupted field key (e.g. "email\t" → "email")
                if (corruptedKey) {
                    try {
                        const docRef = doc(this.firestore, 'users', matchedDoc.id);
                        await updateDoc(docRef, {
                            'email': matchedDoc.data()[corruptedKey],
                            [corruptedKey]: deleteField()
                        });
                        console.log('[AuthZ] Auto-fixed corrupted field', JSON.stringify(corruptedKey),
                            '→ "email" on doc', matchedDoc.id);
                    } catch (fixErr) {
                        console.warn('[AuthZ] Could not auto-fix corrupted field:', fixErr);
                    }
                }

                console.log('[AuthZ] Found user via client-side fallback:', matchedDoc.id);
                userSnapshot = { empty: false, size: 1, docs: [matchedDoc] } as any;
            }

            const userDoc = userSnapshot.docs[0];
            const userData = userDoc.data();
            const userId = userDoc.id;

            // Helper: get a field value by name, tolerating invisible chars in keys
            const getField = (data: any, fieldName: string): any => {
                // Try exact match first
                if (data[fieldName] !== undefined) return data[fieldName];
                // Fallback: find a key that matches after stripping non-printable chars
                const cleanName = fieldName.replace(/[^\x20-\x7E]/g, '').trim();
                for (const key of Object.keys(data)) {
                    const cleanKey = key.replace(/[^\x20-\x7E]/g, '').trim();
                    if (cleanKey === cleanName) return data[key];
                }
                return undefined;
            };

            // Extract role from global_roles array
            let role: 'doctor' | 'receptionist' = 'doctor';
            const globalRoles = getField(userData, 'global_roles');
            if (globalRoles && Array.isArray(globalRoles)) {
                for (const r of globalRoles) {
                    if (r === 'recep' || r === 'receptionist') {
                        role = 'receptionist';
                        break;
                    }
                    if (KNOWN_ROLES.includes(r)) {
                        role = r as 'doctor' | 'receptionist';
                        break;
                    }
                }
            }

            // Check for per-user permission overrides
            let userPermissionOverrides: string[] | null = null;
            const perms = getField(userData, 'permissions');
            if (perms && Array.isArray(perms)) {
                userPermissionOverrides = perms;
            }

            // Step 2: Find clinic_users entries for this user
            const clinicUsersCol = collection(this.firestore, 'clinic_users');
            const cuQuery = query(clinicUsersCol, where('user_id', '==', userId), where('status', '==', 'active'));
            const cuSnapshot = await getDocs(cuQuery);

            let subscriptionId = '';
            const clinicIds: string[] = [];

            for (const cuDoc of cuSnapshot.docs) {
                const cuData = cuDoc.data();
                if (cuData['subscription_id']) {
                    subscriptionId = cuData['subscription_id'];
                }
                if (cuData['clinic_id'] && !clinicIds.includes(cuData['clinic_id'])) {
                    clinicIds.push(cuData['clinic_id']);
                }
                // Override role from clinic_users if present
                if (cuData['roles'] && Array.isArray(cuData['roles'])) {
                    for (const r of cuData['roles']) {
                        if (r === 'recep' || r === 'receptionist') {
                            role = 'receptionist';
                            break;
                        }
                    }
                }
            }

            const result: UserLookupResult = {
                userId,
                subscriptionId,
                clinicIds,
                role,
                userPermissionOverrides,
                timestamp: Date.now()
            };

            this.lookupCache.set(normalized, result);
            console.log('Resolved user context for', normalized,
                '→ sub:', subscriptionId, 'clinics:', clinicIds,
                'role:', role, 'overrides:', userPermissionOverrides ? 'yes' : 'no');
            return result;
        } catch (error: any) {
            console.error('User lookup failed for:', normalized, error);
            console.error('Error code:', error?.code);
            console.error('Error message:', error?.message);
            return null;
        }
    }

    /**
     * Load global role defaults from top-level roles collection.
     * Reads: roles/{roleName} → permissions array (e.g. ["VIEW_APPOINTMENT", "WRITE_PRESCRIPTION"])
     */
    private async loadRoleDefaults(roleName: string): Promise<string[]> {
        // Check cache
        if (this.roleDefaultsCache.has(roleName)) {
            return this.roleDefaultsCache.get(roleName)!;
        }

        try {
            const roleDocRef = doc(this.firestore, 'roles', roleName);
            const roleDoc = await getDoc(roleDocRef);

            let permissions: string[] = [];
            if (roleDoc.exists()) {
                const data = roleDoc.data();
                // The roles collection stores permissions as an array value
                // e.g. roles/doctor: ["VIEW_APPOINTMENT", "WRITE_PRESCRIPTION"]
                // or as a permissions field
                if (Array.isArray(data)) {
                    permissions = data;
                } else if (data['permissions'] && Array.isArray(data['permissions'])) {
                    permissions = data['permissions'];
                } else {
                    // The document value itself may be the permission list
                    // Try to extract from the document fields
                    const keys = Object.keys(data);
                    if (keys.length > 0 && Array.isArray(data[keys[0]])) {
                        permissions = data[keys[0]];
                    }
                }
            } else {
                console.warn(`No global role defaults for: roles/${roleName}`);
            }

            this.roleDefaultsCache.set(roleName, permissions);
            return permissions;
        } catch (error) {
            console.error('Failed to load role defaults:', roleName, error);
            return [];
        }
    }

    /**
     * Convert permission name strings to UserPermissions object.
     */
    private mapPermissionNames(permNames: string[]): UserPermissions {
        const permissions: UserPermissions = { ...DEFAULT_PERMISSIONS };
        for (const permName of permNames) {
            const key = permName as keyof UserPermissions;
            if (key in permissions) {
                permissions[key] = true;
            }
        }
        return permissions;
    }

    /**
     * Check if an email is allowed (exists in users collection).
     */
    async isEmailAllowed(email: string): Promise<boolean> {
        try {
            const result = await this.lookupUser(email);
            return result !== null;
        } catch (error) {
            console.warn('Access check failed for:', email, error);
            return false;
        }
    }

    /**
     * Returns the role for a given email.
     */
    async getUserRole(email: string): Promise<'doctor' | 'receptionist'> {
        try {
            const result = await this.lookupUser(email);
            return result?.role ?? 'doctor';
        } catch (error) {
            console.warn('Role check failed for:', email);
            return 'doctor';
        }
    }

    /**
     * Resolve permissions using layered approach:
     * 1. Per-user overrides (user doc "permissions" field) → HIGHEST priority
     * 2. Global role defaults (roles/{roleName}) → fallback
     */
    async getUserPermissions(email: string): Promise<UserPermissions> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return { ...DEFAULT_PERMISSIONS };

            let permNames: string[];

            if (result.userPermissionOverrides) {
                permNames = result.userPermissionOverrides;
                console.log('Using per-user permission overrides for', normalizeEmail(email));
            } else {
                permNames = await this.loadRoleDefaults(result.role);
                console.log('Using global role defaults for', normalizeEmail(email), '→', result.role);
            }

            const permissions = this.mapPermissionNames(permNames);
            console.log('Resolved permissions for', normalizeEmail(email), permissions);
            return permissions;
        } catch (error) {
            console.warn('getUserPermissions failed for:', email, error);
            return { ...DEFAULT_PERMISSIONS };
        }
    }

    /**
     * Check if a user has delete permissions.
     */
    async canUserDelete(email: string): Promise<boolean> {
        try {
            const perms = await this.getUserPermissions(email);
            return perms.canDelete;
        } catch (error) {
            console.warn('canDelete check failed for:', email);
            return false;
        }
    }

    /**
     * List of clinic IDs a user can access.
     */
    async getUserClinicIds(email: string): Promise<string[]> {
        try {
            const result = await this.lookupUser(email);
            return result?.clinicIds ?? [];
        } catch (error) {
            console.warn('getUserClinicIds failed for:', email, error);
            return [];
        }
    }

    /**
     * Subscription ID for a user.
     */
    async getUserSubscriptionId(email: string): Promise<string | null> {
        try {
            const result = await this.lookupUser(email);
            return result?.subscriptionId ?? null;
        } catch (error) {
            console.warn('getUserSubscriptionId failed for:', email, error);
            return null;
        }
    }

    /**
     * Get the Firestore user document ID for a given email.
     */
    async getUserId(email: string): Promise<string | null> {
        try {
            const result = await this.lookupUser(email);
            return result?.userId ?? null;
        } catch (error) {
            console.warn('getUserId failed for:', email, error);
            return null;
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
        console.log('allowEmail is a no-op in new model:', email);
    }

    async denyEmail(email: string): Promise<void> {
        console.log('denyEmail is a no-op in new model:', email);
    }
}