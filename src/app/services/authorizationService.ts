import { Injectable, inject } from '@angular/core';
import { FirestoreApiService, DELETE_FIELD } from './firestore-api.service';
import { normalizeEmail } from '../utilities/normalize-email';
import { ClinicUserAvailability } from '../models/clinic-user.model';


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
    add_clinic: boolean;
    add_staff: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
    canDelete: false,
    canEdit: false,
    canAddPatient: false,
    canAddVisit: false,
    canAppointment: false,
    canCancel: false,
    canEditVisit: false,
    add_clinic: false,
    add_staff: false,
};

/** Known role names */
const KNOWN_ROLES: string[] = ['doctor', 'receptionist', 'subscription_owner', 'z_admin', 'admin'];

/** A single subscription↔clinic link for a user */
export interface ClinicAssignment {
    subscriptionId: string;
    clinicId: string;
}

/**
 * Cached result from the users + clinic_users lookup.
 */
interface UserLookupResult {
    userId: string;
    /** Display name from the users collection */
    userName: string;
    /** Doctor specialization (e.g. "Cardiologist", "General Physician") */
    specialization: string;
    /** All subscription↔clinic assignments from clinic_users */
    assignments: ClinicAssignment[];
    subscriptionId: string;
    clinicIds: string[];
    role: string;
    /** Full global_roles array from the users collection */
    globalRoles: string[];
    timestamp: number;
}

@Injectable({
    providedIn: 'root'
})
export class AuthorizationService {
    private api = inject(FirestoreApiService);

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
     * clinic_users/{cu_id}: { clinic_id, user_id, availability, status }
     * clinics/{clinic_id}: { subscription_id, ... }
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

            // Handle multiple user documents: aggregate clinic_users from ALL docs
            // so that assignments across different subscriptions are all visible.
            let userDoc = userDocs[0];
            if (userDocs.length > 1) {
                console.warn('[AuthZ] Found', userDocs.length, 'user docs for email:', normalized,
                    '— IDs:', userDocs.map(d => d.id).join(', '), '— aggregating assignments from all');
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
            let role: string = 'doctor';
            const globalRoles = getField(userData, 'global_roles');
            const globalRolesArray: string[] = (globalRoles && Array.isArray(globalRoles)) ? [...globalRoles] : [];
            if (globalRolesArray.length > 0) {
                for (const r of globalRolesArray) {
                    if (r === 'recep' || r === 'receptionist') {
                        role = 'receptionist';
                        break;
                    }
                    // Treat 'admin' as 'subscription_owner' — they share the same portal access
                    if (r === 'admin') {
                        role = 'subscription_owner';
                        break;
                    }
                    if (KNOWN_ROLES.includes(r)) {
                        role = r;
                        break;
                    }
                }
            }

            // Extract display name from user doc
            const userName: string = getField(userData, 'name') || '';

            // Extract specialization from user doc (fallback checked in clinic_users later)
            let specialization: string = getField(userData, 'specialization') || getField(userData, 'specialty') || '';

            // Note: permissions are resolved solely from the roles collection.
            // Any permissions fields on user docs are ignored.

            // Step 2: Find clinic_users entries for ALL user docs (not just one).
            // This aggregates assignments across different subscriptions.
            const allCuDocs: Array<{ id: string; data: any }> = [];
            for (const doc of userDocs) {
                const cuDocs = await this.api.runQuery('', {
                    collectionId: 'clinic_users',
                    filters: [
                        { field: 'user_id', op: '==', value: doc.id }
                    ],
                });
                console.log(`[AuthZ] clinic_users query for user_id="${doc.id}" returned ${cuDocs.length} docs`);
                cuDocs.forEach((d, i) => {
                    const cd = d.data;
                    console.log(`[AuthZ]   clinic_users[${i}] id=${d.id}`,
                        `clinic_id="${cd['clinic_id']}"`,
                        `status="${cd['status'] ?? '(missing→active)'}"`,
                        `user_id="${cd['user_id']}"`
                    );
                });
                allCuDocs.push(...cuDocs);
            }

            if (allCuDocs.length === 0) {
                console.warn('[AuthZ] No clinic_users entries found for any user docs of email:', normalized);
            }

            const assignments: ClinicAssignment[] = [];

            // Collect unique clinic IDs from active clinic_users docs
            const activeClinicIds: string[] = [];
            for (const cuDoc of allCuDocs) {
                const cuData = cuDoc.data;
                const status = cuData['status'] || 'active';
                if (status !== 'active') {
                    console.log(`[AuthZ]   → SKIPPED (status="${status}")`, cuDoc.id);
                    continue;
                }
                const cId = cuData['clinic_id'] || '';
                if (cId && !activeClinicIds.includes(cId)) {
                    activeClinicIds.push(cId);
                }
            }

            // Resolve subscription_id for each clinic by fetching clinic docs
            const clinicSubMap = new Map<string, string>();
            for (const cId of activeClinicIds) {
                try {
                    const clinicDoc = await this.api.getDocument('clinics', cId);
                    if (clinicDoc) {
                        clinicSubMap.set(cId, clinicDoc.data['subscription_id'] || '');
                    }
                } catch {
                    console.warn(`[AuthZ] Could not fetch clinic doc for clinic_id=${cId}`);
                }
            }

            // Build assignments from clinic_users + clinic docs
            for (const cuDoc of allCuDocs) {
                const cuData = cuDoc.data;
                const status = cuData['status'] || 'active';
                if (status !== 'active') continue;
                const cId = cuData['clinic_id'] || '';
                const subId = clinicSubMap.get(cId) || '';
                if (subId && cId) {
                    const exists = assignments.some(a => a.subscriptionId === subId && a.clinicId === cId);
                    if (!exists) {
                        assignments.push({ subscriptionId: subId, clinicId: cId });
                    }
                } else {
                    console.warn(`[AuthZ]   → SKIPPED (missing subId or clinicId)`, cuDoc.id, { subId, cId });
                }
            }
            // Role is resolved solely from the users collection global_roles.
            // Permissions are resolved solely from the roles collection.

            // If specialization not found on user doc, check clinic_users docs
            if (!specialization) {
                for (const cuDoc of allCuDocs) {
                    const cuData = cuDoc.data;
                    const cuSpec = cuData['specialization'] || cuData['specialty'] || '';
                    if (cuSpec) { specialization = cuSpec; break; }
                }
            }

            // Extract subscriptionId and clinicIds from assignments
            const subscriptionIds = [...new Set(assignments.map(a => a.subscriptionId))];
            const clinicIds = [...new Set(assignments.map(a => a.clinicId))];
            const subscriptionId = subscriptionIds.length > 0 ? subscriptionIds[0] : '';

            const result: UserLookupResult = {
                userId,
                userName,
                specialization,
                assignments,
                subscriptionId,
                clinicIds,
                role,
                globalRoles: globalRolesArray,
                timestamp: Date.now()
            };

            this.lookupCache.set(normalized, result);

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

    // Note: Subscription-level and clinic-level permission overrides have been removed.
    // Permissions are resolved solely from the roles/{roleName} collection.

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
     * Auto-provision a minimal Firestore user document for a user who
     * authenticated via Firebase Auth but has no corresponding Firestore doc.
     * This handles "orphaned" auth users from incomplete registrations.
     *
     * Returns the role of the newly created (or existing) user.
     */
    async autoProvisionUser(email: string, displayName: string): Promise<string> {
        const normalized = normalizeEmail(email);

        // Double-check the user really doesn't exist
        const existing = await this.lookupUser(normalized);
        if (existing) {
            return existing.role;
        }

        console.log('[AuthZ] Auto-provisioning Firestore user doc for:', normalized);

        const userDocId = this.api.generateDocId();
        const defaultRole = 'doctor';

        await this.api.setDocument('users', userDocId, {
            name: displayName || normalized.split('@')[0] || 'User',
            email: normalized,
            global_roles: [defaultRole],
            status: 'active',
            created_at: new Date().toISOString(),
            auto_provisioned: true
        });

        // Invalidate cache so subsequent lookups find the new doc
        this.lookupCache.delete(normalized);

        console.log('[AuthZ] Auto-provisioned user doc:', userDocId, 'for:', normalized);
        return defaultRole;
    }

    /**
     * Returns the role for a given email.
     */
    async getUserRole(email: string): Promise<string> {
        try {
            const result = await this.lookupUser(email);
            return result?.role ?? 'doctor';
        } catch (error) {
            console.warn('Role check failed for:', email);
            return 'doctor';
        }
    }

    /**
     * Returns the full global_roles array for a given email.
     * Use this when you need to know ALL roles (e.g. login routing).
     */
    async getUserGlobalRoles(email: string): Promise<string[]> {
        try {
            const result = await this.lookupUser(email);
            return result?.globalRoles ?? [];
        } catch (error) {
            console.warn('getUserGlobalRoles failed for:', email, error);
            return [];
        }
    }

    /**
     * Resolve permissions from the roles collection only.
     * Reads: roles/{roleName} → permissions array
     *
     * Permissions are defined centrally in the roles collection and are not
     * overridden at the subscription, clinic, clinic_user, or user level.
     */
    async getUserPermissions(email: string): Promise<UserPermissions> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return { ...DEFAULT_PERMISSIONS };

            // Merge permissions from ALL global_roles so that admin+doctor
            // users get both admin and doctor permissions (e.g. canAppointment).
            const allRoles = result.globalRoles.length > 0
                ? result.globalRoles
                : [result.role];

            // Map role names: 'admin' → 'subscription_owner', 'receptionist'/'recep' stays
            const resolvedRoleNames = allRoles.map(r => {
                if (r === 'admin') return 'subscription_owner';
                if (r === 'recep') return 'receptionist';
                return r;
            });

            // Load permissions from each role and merge them (union)
            let mergedPermNames: string[] = [];
            for (const roleName of new Set(resolvedRoleNames)) {
                const permNames = await this.loadRoleDefaults(roleName);
                mergedPermNames = mergedPermNames.concat(permNames);
            }

            const permissions = this.mapPermissionNames([...new Set(mergedPermNames)]);

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
     * List of clinic IDs a user can access (across all subscriptions).
     */
    async getUserClinicIds(email: string): Promise<string[]> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return [];
            const unique = new Set(result.assignments.map(a => a.clinicId));
            return [...unique];
        } catch (error) {
            console.warn('getUserClinicIds failed for:', email, error);
            return [];
        }
    }

    /**
     * Subscription ID for a user.
     * Returns the first subscription found (backward-compatible).
     */
    async getUserSubscriptionId(email: string): Promise<string | null> {
        try {
            const result = await this.lookupUser(email);
            if (!result || result.assignments.length === 0) return null;
            return result.assignments[0].subscriptionId;
        } catch (error) {
            console.warn('getUserSubscriptionId failed for:', email, error);
            return null;
        }
    }

    /**
     * Full list of subscription↔clinic assignments for a user.
     * Used by the login flow to show subscription/clinic pickers.
     */
    async getUserAssignments(email: string): Promise<ClinicAssignment[]> {
        try {
            const result = await this.lookupUser(email);
            return result?.assignments ?? [];
        } catch (error) {
            console.warn('getUserAssignments failed for:', email, error);
            return [];
        }
    }

    /**
     * List of unique subscription IDs a user belongs to.
     */
    async getSubscriptionIds(email: string): Promise<string[]> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return [];
            const unique = new Set(result.assignments.map(a => a.subscriptionId));
            return [...unique];
        } catch (error) {
            console.warn('getSubscriptionIds failed for:', email, error);
            return [];
        }
    }

    /**
     * List of clinic IDs within a specific subscription for a user.
     */
    async getClinicIdsForSubscription(email: string, subscriptionId: string): Promise<string[]> {
        try {
            const result = await this.lookupUser(email);
            if (!result) return [];
            return result.assignments
                .filter(a => a.subscriptionId === subscriptionId)
                .map(a => a.clinicId);
        } catch (error) {
            console.warn('getClinicIdsForSubscription failed for:', email, error);
            return [];
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
     * Returns the availability map (e.g. { M: ["FH"], T: ["FH","SH"] })
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

                const userId = cuData['user_id'];
                if (!userId || seenUserIds.has(userId)) continue;
                seenUserIds.add(userId);

                // Fetch user document for name/email/role
                try {
                    const userResult = await this.api.getDocument('users', userId);
                    if (!userResult) continue;

                    const userData = userResult.data;

                    // Check if user has 'doctor' role in global_roles
                    const globalRoles: string[] = userData['global_roles'] || [];
                    const isDoctor = globalRoles.some((r: string) => r === 'doctor');
                    if (!isDoctor) continue;

                    const email = (userData['email'] || '').trim().toLowerCase();
                    const name = userData['name'] || email.split('@')[0] || 'Doctor';
                    const specialty = userData['specialization'] || userData['specialty'] || '';
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
     * Resolves clinic IDs from the clinics collection, then queries clinic_users by clinic_id.
     */
    async getDoctorsForSubscription(subscriptionId: string): Promise<Array<{ id: string; name: string; specialty: string; avatar: string; email: string }>> {
        if (!subscriptionId) return [];
        try {
            // First, fetch all clinics for this subscription
            const clinicDocs = await this.api.runQuery('', {
                collectionId: 'clinics',
                filters: [
                    { field: 'subscription_id', op: '==', value: subscriptionId }
                ],
            });
            const clinicIds = clinicDocs.map(d => d.id);
            if (clinicIds.length === 0) return [];

            // Fetch clinic_users for each clinic
            const doctors: Array<{ id: string; name: string; specialty: string; avatar: string; email: string }> = [];
            const seenUserIds = new Set<string>();

            for (const clinicId of clinicIds) {
                const cuDocs = await this.api.runQuery('', {
                    collectionId: 'clinic_users',
                    filters: [
                        { field: 'clinic_id', op: '==', value: clinicId }
                    ],
                });

                for (const cuDoc of cuDocs) {
                    const cuData = cuDoc.data;
                    const status = cuData['status'] || 'active';
                    if (status !== 'active') continue;

                    const userId = cuData['user_id'];
                    if (!userId || seenUserIds.has(userId)) continue;
                    seenUserIds.add(userId);

                    try {
                        const userResult = await this.api.getDocument('users', userId);
                        if (!userResult) continue;

                        const userData = userResult.data;

                        // Check if user has 'doctor' role in global_roles
                        const globalRoles: string[] = userData['global_roles'] || [];
                        const isDoctor = globalRoles.some((r: string) => r === 'doctor');
                        if (!isDoctor) continue;

                        const email = (userData['email'] || '').trim().toLowerCase();
                        const name = userData['name'] || email.split('@')[0] || 'Doctor';
                        const specialty = userData['specialization'] || userData['specialty'] || '';
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
            }

            return doctors;
        } catch (error) {
            console.error('getDoctorsForSubscription failed:', subscriptionId, error);
            return [];
        }
    }

    /**
     * Fetch all clinics for a given subscription ID.
     * Returns id + name pairs for dropdown display.
     * Unlike getUserClinicIds(), this returns ALL clinics in the subscription,
     * not just the ones the user is assigned to via clinic_users.
     */
    async getAllClinicsForSubscription(subscriptionId: string): Promise<Array<{ id: string; name: string }>> {
        if (!subscriptionId) return [];
        try {
            const clinicDocs = await this.api.runQuery('', {
                collectionId: 'clinics',
                filters: [
                    { field: 'subscription_id', op: '==', value: subscriptionId }
                ],
            });
            return clinicDocs
                .filter(d => (d.data['status'] || 'active') === 'active')
                .map(d => ({
                    id: d.id,
                    name: d.data['name'] || d.id
                }));
        } catch (error) {
            console.error('getAllClinicsForSubscription failed:', subscriptionId, error);
            return [];
        }
    }

    async allowEmail(email: string): Promise<void> {

    }

    async denyEmail(email: string): Promise<void> {

    }
}