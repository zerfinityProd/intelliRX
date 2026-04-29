import { Injectable, inject } from '@angular/core';
import { FirestoreApiService, DELETE_FIELD } from './api/firestore-api.service';
import { normalizeEmail } from '../utilities/normalize-email';
import { ClinicUserAvailability } from '../models/clinic-user.model';
import { ClinicContextService } from './clinicContextService';

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
    canEditVisit: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
    canDelete: false,
    canEdit: false,
    canAddPatient: false,
    canAddVisit: false,
    canAppointment: false,
    canCancel: false,
    canEditVisit: false,
};

/** Known role names */
const KNOWN_ROLES: string[] = ['doctor', 'receptionist'];

/**
 * Cached result from the users + clinic_users lookup.
 */
interface UserLookupResult {
    userId: string;
    /** Display name from the users collection */
    userName: string;
    /** Doctor specialization (e.g. "Cardiologist", "General Physician") */
    specialization: string;
    subscriptionId: string;
    clinicIds: string[];
    role: 'doctor' | 'receptionist';
    /** Per-user permission overrides (if present on the user doc) */
    userPermissionOverrides: string[] | null;
    /** Per-clinic_user permission overrides (from clinic_users doc for active clinic) */
    clinicUserPermissions: Map<string, string[] | null>;
    timestamp: number;
}

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private api = inject(FirestoreApiService);
    private clinicContext = inject(ClinicContextService);

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
            let userDocs = await this.api.runQuery('', {
                collectionId: 'users',
                filters: [
                    { field: 'email', op: '==', value: normalized }
                ],
            });

            // Fallback: if where-query returned 0 docs, fetch all and match client-side.
            // This handles cases where Firestore field keys have invisible characters,
            // security rules silently block the query, or field name casing differs.
            let corruptedKey: string | null = null;
            if (userDocs.length === 0) {
                console.warn('[AuthZ] where-query returned 0 docs for', normalized, '— trying client-side fallback');
                const allUsers = await this.api.listDocuments('users', 300);
                console.log('[AuthZ] Fetched', allUsers.length, 'docs from users collection for fallback');

                const matchedDoc = allUsers.find(d => {
                    const data = d.data;
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
                    allUsers.forEach(d => {
                        const data = d.data;
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
                        await this.api.updateDocument('users', matchedDoc.id, {
                            'email': matchedDoc.data[corruptedKey],
                            [corruptedKey]: DELETE_FIELD
                        });
                        console.log('[AuthZ] Auto-fixed corrupted field', JSON.stringify(corruptedKey),
                            '→ "email" on doc', matchedDoc.id);
                    } catch (fixErr) {
                        console.warn('[AuthZ] Could not auto-fix corrupted field:', fixErr);
                    }
                }

                console.log('[AuthZ] Found user via client-side fallback:', matchedDoc.id);
                userDocs = [matchedDoc];
            }

            // Handle duplicate user documents: prefer the one with clinic_users entries
            let userDoc = userDocs[0];
            if (userDocs.length > 1) {
                console.warn('[AuthZ] Found', userDocs.length, 'user docs for email:', normalized,
                    '— IDs:', userDocs.map(d => d.id).join(', '));

                // Check which user doc has associated clinic_users entries
                for (const candidateDoc of userDocs) {
                    const candidateResults = await this.api.runQuery('', {
                        collectionId: 'clinic_users',
                        filters: [
                            { field: 'user_id', op: '==', value: candidateDoc.id }
                        ],
                    });
                    if (candidateResults.length > 0) {
                        console.log('[AuthZ] Preferring user doc', candidateDoc.id, 'which has', candidateResults.length, 'clinic_users entries');
                        userDoc = candidateDoc;
                        break;
                    }
                }
            }
            const userData = userDoc.data;
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

            // Extract display name from user doc
            const userName: string = getField(userData, 'name') || '';

            // Extract specialization from user doc (fallback checked in clinic_users later)
            let specialization: string = getField(userData, 'specialization') || getField(userData, 'specialty') || '';

            // Check for per-user permission overrides
            let userPermissionOverrides: string[] | null = null;
            const perms = getField(userData, 'permissions');
            if (perms && Array.isArray(perms)) {
                userPermissionOverrides = perms;
            }

            // Step 2: Find clinic_users entries for this user.
            // Query by user_id only; filter status client-side because documents
            // may lack the 'status' field entirely (treat missing → active).
            const cuDocs = await this.api.runQuery('', {
                collectionId: 'clinic_users',
                filters: [
                    { field: 'user_id', op: '==', value: userId }
                ],
            });

            if (cuDocs.length === 0) {
                console.warn('[AuthZ] No clinic_users entries found for user_id:', userId,
                    '(email:', normalized, '). The user needs a clinic_users record.');
            }

            let subscriptionId = '';
            const clinicIds: string[] = [];
            const clinicUserPermissions = new Map<string, string[] | null>();

            for (const cuDoc of cuDocs) {
                const cuData = cuDoc.data;
                // Treat missing status as active; skip only explicitly inactive/disabled
                const status = cuData['status'] || 'active';
                if (status !== 'active') continue;
                if (cuData['subscription_id']) {
                    subscriptionId = cuData['subscription_id'];
                }
                const cId = cuData['clinic_id'];
                if (cId && !clinicIds.includes(cId)) {
                    clinicIds.push(cId);
                }
                // Override role from clinic_users if present (clinic_users role is authoritative)
                if (cuData['roles'] && Array.isArray(cuData['roles'])) {
                    for (const r of cuData['roles']) {
                        if (r === 'recep' || r === 'receptionist') {
                            role = 'receptionist';
                            break;
                        }
                        if (r === 'doctor') {
                            role = 'doctor';
                            break;
                        }
                        if (KNOWN_ROLES.includes(r)) {
                            role = r as 'doctor' | 'receptionist';
                            break;
                        }
                    }
                }
                // Capture per-clinic_user permission overrides (Layer 4)
                if (cId) {
                    const cuPerms = cuData['permissions'];
                    clinicUserPermissions.set(cId, (cuPerms && Array.isArray(cuPerms)) ? cuPerms : null);
                }
            }

            // If specialization not found on user doc, check clinic_users docs
            if (!specialization) {
                for (const cuDoc of cuDocs) {
                    const cuData = cuDoc.data;
                    const cuSpec = cuData['specialization'] || cuData['specialty'] || '';
                    if (cuSpec) { specialization = cuSpec; break; }
                }
            }

            const result: UserLookupResult = {
                userId,
                userName,
                specialization,
                subscriptionId,
                clinicIds,
                role,
                userPermissionOverrides,
                clinicUserPermissions,
                timestamp: Date.now()
            };

            this.lookupCache.set(normalized, result);
            console.log('Resolved user context for', normalized,
                '→ name:', userName, 'sub:', subscriptionId, 'clinics:', clinicIds,
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
            const result = await this.api.getDocument('roles', roleName);

            let permissions: string[] = [];
            if (result) {
                const data = result.data;
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
     * Load subscription-level permission overrides for a given role.
     * Reads: subscriptions/{subId}.permissions[roleName]
     * Returns the override array if present, or null to fall through.
     */
    private async loadSubscriptionPermissions(subscriptionId: string, roleName: string): Promise<string[] | null> {
        if (!subscriptionId) return null;
        try {
            const result = await this.api.getDocument('subscriptions', subscriptionId);
            if (result) {
                const data = result.data;
                const perms = data['permissions'];
                if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
                    const rolePerms = perms[roleName];
                    if (rolePerms && Array.isArray(rolePerms)) {
                        return rolePerms;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load subscription permissions:', subscriptionId, error);
        }
        return null;
    }

    /**
     * Load clinic-level permission overrides for a given role.
     * Reads: clinics/{clinicId}.permissions[roleName]
     * Returns the override array if present, or null to fall through.
     */
    private async loadClinicPermissions(clinicId: string, roleName: string): Promise<string[] | null> {
        if (!clinicId) return null;
        try {
            const result = await this.api.getDocument('clinics', clinicId);
            if (result) {
                const data = result.data;
                const perms = data['permissions'];
                if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
                    const rolePerms = perms[roleName];
                    if (rolePerms && Array.isArray(rolePerms)) {
                        return rolePerms;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load clinic permissions:', clinicId, error);
        }
        return null;
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
     * Resolve permissions using a 4-layer hierarchical approach.
     * Each layer REPLACES the previous if it defines permissions for the user's role.
     *
     * Layer 1: Global role defaults       → roles/{roleName}                          (base)
     * Layer 2: Subscription overrides     → subscriptions/{subId}.permissions[role]   (org-level)
     * Layer 3: Clinic overrides           → clinics/{clinicId}.permissions[role]       (clinic-level)
     * Layer 4: Individual overrides       → clinic_users/{cuId}.permissions            (per-doctor)
     * Layer 5: User-doc overrides         → users/{userId}.permissions                 (super override)
     *
     * Higher layers win (replace semantics). If a layer has no permissions, previous layer carries through.
     */
    async getUserPermissions(email: string): Promise<UserPermissions> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return { ...DEFAULT_PERMISSIONS };

            const roleName = result.role;
            const currentClinicId = this.clinicContext.getSelectedClinicId();
            let permNames: string[];
            let resolvedFrom = 'Layer 1 (global role defaults)';

            // Layer 1: Global role defaults
            permNames = await this.loadRoleDefaults(roleName);

            // Layer 2: Subscription overrides
            if (result.subscriptionId) {
                const subPerms = await this.loadSubscriptionPermissions(result.subscriptionId, roleName);
                if (subPerms) {
                    permNames = subPerms;
                    resolvedFrom = 'Layer 2 (subscription)';
                }
            }

            // Layer 3: Clinic overrides (based on currently selected clinic)
            if (currentClinicId) {
                const clinicPerms = await this.loadClinicPermissions(currentClinicId, roleName);
                if (clinicPerms) {
                    permNames = clinicPerms;
                    resolvedFrom = 'Layer 3 (clinic)';
                }
            }

            // Layer 4: Individual overrides (from clinic_users doc for current clinic)
            if (currentClinicId && result.clinicUserPermissions.has(currentClinicId)) {
                const cuPerms = result.clinicUserPermissions.get(currentClinicId);
                if (cuPerms) {
                    permNames = cuPerms;
                    resolvedFrom = 'Layer 4 (clinic_user)';
                }
            }

            // Layer 5: User-doc overrides (super override — always wins)
            if (result.userPermissionOverrides) {
                permNames = result.userPermissionOverrides;
                resolvedFrom = 'Layer 5 (user-doc override)';
            }

            const permissions = this.mapPermissionNames(permNames);
            console.log('Resolved permissions for', normalizeEmail(email),
                '→', resolvedFrom, permissions);
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
     * Returns the display name from the users collection for a given email.
     */
    async getUserName(email: string): Promise<string> {
        try {
            const result = await this.lookupUser(email);
            return result?.userName ?? '';
        } catch (error) {
            console.warn('getUserName failed for:', email, error);
            return '';
        }
    }

    /**
     * Returns the specialization from the users or clinic_users collection for a given email.
     */
    async getUserSpecialization(email: string): Promise<string> {
        try {
            const result = await this.lookupUser(email);
            return result?.specialization ?? '';
        } catch (error) {
            console.warn('getUserSpecialization failed for:', email, error);
            return '';
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

    /**
     * Fetch a doctor's per-weekday availability for a specific clinic.
     *
     * Returns the availability map (e.g. { mon: ["FH"], tue: ["FH","SH"] })
     * or null if the doctor has no availability configured (meaning all blocks available).
     */
    async getDoctorAvailability(
        email: string,
        clinicId: string
    ): Promise<ClinicUserAvailability | null> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return null;

            const cuDocs = await this.api.runQuery('', {
                collectionId: 'clinic_users',
                filters: [
                    { field: 'user_id', op: '==', value: result.userId },
                    { field: 'clinic_id', op: '==', value: clinicId }
                ],
            });

            // Filter client-side: treat missing status as active
            const activeDocs = cuDocs.filter(d => {
                const s = d.data['status'] || 'active';
                return s === 'active';
            });
            if (activeDocs.length === 0) return null;

            const cuData = activeDocs[0].data;
            const availability = cuData['availability'];
            if (!availability || typeof availability !== 'object') return null;

            return availability as ClinicUserAvailability;
        } catch (error) {
            console.warn('getDoctorAvailability failed for:', email, clinicId, error);
            return null;
        }
    }

    /**
     * Fetch all doctors assigned to a specific clinic from the database.
     * Queries clinic_users where clinic_id matches and roles include 'doctor',
     * then joins with the users collection for name/email.
     */
    async getDoctorsForClinic(clinicId: string): Promise<Array<{ id: string; name: string; specialty: string; avatar: string; email: string }>> {
        if (!clinicId) return [];
        try {
            const cuDocs = await this.api.runQuery('', {
                collectionId: 'clinic_users',
                filters: [
                    { field: 'clinic_id', op: '==', value: clinicId }
                ],
            });

            const doctors: Array<{ id: string; name: string; specialty: string; avatar: string; email: string }> = [];
            const seenUserIds = new Set<string>();

            for (const cuDoc of cuDocs) {
                const cuData = cuDoc.data;
                const status = cuData['status'] || 'active';
                if (status !== 'active') continue;

                // Check if this clinic_user has 'doctor' role
                const roles: string[] = cuData['roles'] || [];
                const isDoctor = roles.some(r => r === 'doctor');
                if (!isDoctor) continue;

                const userId = cuData['user_id'];
                if (!userId || seenUserIds.has(userId)) continue;
                seenUserIds.add(userId);

                // Fetch user document for name/email
                try {
                    const userResult = await this.api.getDocument('users', userId);
                    if (!userResult) continue;

                    const userData = userResult.data;
                    const email = (userData['email'] || '').trim().toLowerCase();
                    const name = userData['name'] || email.split('@')[0] || 'Doctor';
                    const specialty = cuData['specialization'] || cuData['specialty'] || userData['specialization'] || userData['specialty'] || '';
                    const initials = name.split(' ').filter(Boolean).map((w: string) => w[0]?.toUpperCase() || '').join('').slice(0, 2);

                    doctors.push({
                        id: `dr_${userId}`,
                        name,
                        specialty,
                        avatar: initials,
                        email
                    });
                } catch {
                    // Skip this doctor if user doc fails
                }
            }

            return doctors;
        } catch (error) {
            console.error('getDoctorsForClinic failed:', clinicId, error);
            return [];
        }
    }

    /**
     * Fetch all doctors across all clinics for a given subscription.
     * Used as a fallback when no specific clinic is selected.
     */
    async getDoctorsForSubscription(subscriptionId: string): Promise<Array<{ id: string; name: string; specialty: string; avatar: string; email: string }>> {
        if (!subscriptionId) return [];
        try {
            const cuDocs = await this.api.runQuery('', {
                collectionId: 'clinic_users',
                filters: [
                    { field: 'subscription_id', op: '==', value: subscriptionId }
                ],
            });

            const doctors: Array<{ id: string; name: string; specialty: string; avatar: string; email: string }> = [];
            const seenUserIds = new Set<string>();

            for (const cuDoc of cuDocs) {
                const cuData = cuDoc.data;
                const status = cuData['status'] || 'active';
                if (status !== 'active') continue;

                const roles: string[] = cuData['roles'] || [];
                const isDoctor = roles.some(r => r === 'doctor');
                if (!isDoctor) continue;

                const userId = cuData['user_id'];
                if (!userId || seenUserIds.has(userId)) continue;
                seenUserIds.add(userId);

                try {
                    const userResult = await this.api.getDocument('users', userId);
                    if (!userResult) continue;

                    const userData = userResult.data;
                    const email = (userData['email'] || '').trim().toLowerCase();
                    const name = userData['name'] || email.split('@')[0] || 'Doctor';
                    const specialty = cuData['specialization'] || cuData['specialty'] || userData['specialization'] || userData['specialty'] || '';
                    const initials = name.split(' ').filter(Boolean).map((w: string) => w[0]?.toUpperCase() || '').join('').slice(0, 2);

                    doctors.push({
                        id: `dr_${userId}`,
                        name,
                        specialty,
                        avatar: initials,
                        email
                    });
                } catch {
                    // Skip
                }
            }

            return doctors;
        } catch (error) {
            console.error('getDoctorsForSubscription failed:', subscriptionId, error);
            return [];
        }
    }

    async allowEmail(email: string): Promise<void> {
        console.log('allowEmail is a no-op in new model:', email);
    }

    async denyEmail(email: string): Promise<void> {
        console.log('denyEmail is a no-op in new model:', email);
    }
}