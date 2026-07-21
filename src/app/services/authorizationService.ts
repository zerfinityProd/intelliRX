import { Injectable, inject } from '@angular/core';
import { UserRepository, UserRecord } from '../repositories/interfaces/user.repository';
import { ClinicRepository } from '../repositories/interfaces/clinic.repository';
import { SubscriptionRepository } from '../repositories/interfaces/subscription.repository';
import { normalizeEmail } from '../utilities/normalize-email';
import { ClinicUserAvailability } from '../models/clinic-user.model';
import { ConfigService } from './configService';


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
    private userRepo = inject(UserRepository);
    private clinicRepo = inject(ClinicRepository);
    private subscriptionRepo = inject(SubscriptionRepository);
    private configService = inject(ConfigService);

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
            let userDocs: UserRecord[] = [];
            const userByEmail = await this.userRepo.getUserByEmail(normalized);
            if (userByEmail) {
                userDocs = [userByEmail];
            } else {
                // Keep userDocs empty — fallback will run
            }
            // Convert to { id, data } shape for compatibility with rest of logic
            let rawUserDocs: Array<{ id: string; data: any }> = userDocs.map(u => ({ id: u.id!, data: u }));

            // Fallback: if where-query returned 0 docs, fetch all and match client-side.
            // This handles cases where Firestore field keys have invisible characters.
            if (rawUserDocs.length === 0) {
                console.warn('[AuthZ] where-query returned 0 docs for', normalized, '— trying client-side fallback');
                const allUsers = await this.userRepo.getAllUsers(300);
                console.debug('[AuthZ] Fetched', allUsers.length, 'docs from users collection for fallback');

                const matchedUser = allUsers.find(u => {
                    for (const key of Object.keys(u)) {
                        const val = (u as any)[key];
                        if (typeof val !== 'string') continue;
                        const cleanValue = stripInvisible(val).toLowerCase();
                        if (cleanValue === normalized) {
                            console.debug('[AuthZ] Fallback matched doc', u.id, 'via key', JSON.stringify(key));
                            return true;
                        }
                    }
                    return false;
                });

                if (!matchedUser) {
                    console.warn('[AuthZ] User not found in users collection (even with fallback):', normalized);
                    return null;
                }

                console.debug('[AuthZ] Found user via client-side fallback:', matchedUser.id);
                rawUserDocs = [{ id: matchedUser.id!, data: matchedUser }];
            }

            // Handle multiple user documents: aggregate clinic_users from ALL docs.
            let rawUserDoc = rawUserDocs[0];
            if (rawUserDocs.length > 1) {
                console.warn('[AuthZ] Found', rawUserDocs.length, 'user docs for email:', normalized,
                    '— IDs:', rawUserDocs.map(d => d.id).join(', '), '— aggregating assignments from all');
            }
            const userData = rawUserDoc.data;
            const userId = rawUserDoc.id;

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
            const allCuDocs: Array<{ id: string; data: any }> = [];
            for (const doc of rawUserDocs) {
                const cuEntries = await this.userRepo.getClinicUsersByUserId(doc.id);
                console.debug(`[AuthZ] clinic_users query for user_id="${doc.id}" returned ${cuEntries.length} docs`);
                cuEntries.forEach((cu, i) => {
                    console.debug(`[AuthZ]   clinic_users[${i}] id=${cu.id}`,
                        `clinic_id="${cu.clinic_id}"`,
                        `status="${(cu as any)['status'] ?? '(missing→active)'}"`,
                        `user_id="${cu.user_id}"`
                    );
                });
                allCuDocs.push(...cuEntries.map(cu => ({ id: cu.id!, data: cu })));
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
                    console.debug(`[AuthZ]   → SKIPPED (status="${status}")`, cuDoc.id);
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
                    const clinic = await this.clinicRepo.getClinicById(cId);
                    if (clinic) {
                        clinicSubMap.set(cId, clinic.subscription_id || '');
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
            // Primary: derive subscriptionId from clinic assignments.
            // Fallback: read the subscription_id field directly from the user doc.
            // This covers admin-only users who have no clinic_users entries.
            let subscriptionId = subscriptionIds.length > 0 ? subscriptionIds[0] : '';
            if (!subscriptionId) {
                const docSubId = getField(userData, 'subscription_id');
                if (docSubId && typeof docSubId === 'string') {
                    subscriptionId = docSubId;
                    console.debug('[AuthZ] subscriptionId resolved from user doc field:', subscriptionId);
                }
            }

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
        if (this.roleDefaultsCache.has(roleName)) {
            return this.roleDefaultsCache.get(roleName)!;
        }
        try {
            const permissions = await this.userRepo.getRolePermissions(roleName);
            if (!permissions.length) {
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

        console.debug('[AuthZ] Auto-provisioning user doc for:', normalized);

        const defaultRole = 'doctor';
        await this.userRepo.createUser({
            name: displayName || normalized.split('@')[0] || 'User',
            email: normalized,
            global_roles: [defaultRole],
            status: 'active',
            auto_provisioned: true,
        } as any);

        this.lookupCache.delete(normalized);

        console.debug('[AuthZ] Auto-provisioned user doc for:', normalized);
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
            if (result && result.assignments.length > 0) {
                return result.assignments[0].subscriptionId;
            }

            // Fallback: clinic docs may be missing the subscription_id field, which causes
            // lookupUser to build zero assignments. Try finding the subscription by owner_email.
            const normalized = normalizeEmail(email);
            console.warn('[AuthZ] getUserSubscriptionId: no assignments from lookupUser for', normalized,
                '— falling back to subscriptions query by owner_email');
            try {
                const allSubs = await this.subscriptionRepo.getSubscriptions();
                const ownerSub = allSubs.find(s => (s as any)['owner_email'] === normalized);
                if (ownerSub) {
                    console.debug('[AuthZ] Fallback subscription found via owner_email:', ownerSub.id);
                    return ownerSub.id;
                }
            } catch (fallbackErr) {
                console.warn('[AuthZ] Fallback subscriptions query failed:', fallbackErr);
            }

            return null;
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
     * Returns the availability map (e.g. { M: ["FH"] } short-code format from
     * admin-dashboard, or { mon: ["FH"] } 3-letter format from staff-config-modal)
     * or null if no availability is configured (meaning no restriction = all slots).
     *
     * Uses a single user_id filter + client-side clinic_id match to avoid silent
     * failures caused by compound query issues or user_id value mismatches.
     */
    async getDoctorAvailability(
        email: string,
        clinicId: string
    ): Promise<ClinicUserAvailability | null> {
        try {
            const result = await this.lookupUser(email);
            if (!result) {
                console.warn('[Avail] lookupUser null for', email);
                return null;
            }

            // Single-field query then client-side clinic_id match — more robust than
            // a compound query which silently returns 0 rows on user_id mismatch.
            const cuEntries = await this.userRepo.getClinicUsersByUserId(result.userId);

            console.debug('[Avail] clinic_users for userId', result.userId, '→', cuEntries.length, 'docs',
                cuEntries.map(cu =>
                    `id=${cu.id} clinic_id=${cu.clinic_id} status=${(cu as any)['status']} avail_keys=${Object.keys(cu.availability || {}).join(',') || 'none'}`
                ).join(' | '));

            // Find the doc matching this clinic.
            const allMatchingDocs = cuEntries.filter(cu => cu.clinic_id === clinicId);

            if (allMatchingDocs.length === 0) {
                console.warn('[Avail] No clinic_users doc for clinicId:', clinicId,
                    '— found clinic_ids:', cuEntries.map(cu => cu.clinic_id));
                return null;
            }

            // Prefer a doc that has a populated availability map
            const matchingDoc =
                allMatchingDocs.find(cu => {
                    const av = cu.availability;
                    return av && typeof av === 'object' && !Array.isArray(av) && Object.keys(av).length > 0;
                }) ?? allMatchingDocs[0];

            const availability = matchingDoc.availability;
            console.debug('[Avail] matched doc', matchingDoc.id,
                'status=', (matchingDoc as any)['status'],
                'availability=', JSON.stringify(availability));

            if (!availability || typeof availability !== 'object' || Array.isArray(availability)) {
                console.warn('[Avail] availability field missing or wrong type in doc', matchingDoc.id);
                return null;
            }

            return availability as ClinicUserAvailability;
        } catch (error) {
            console.warn('[Avail] getDoctorAvailability failed for', email, clinicId, error);
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
            const cuEntries = await this.userRepo.getClinicUsersByClinic(clinicId);

            const doctors: Array<{ id: string; name: string; specialty: string; avatar: string; email: string }> = [];
            const seenUserIds = new Set<string>();

            for (const cu of cuEntries) {
                const status = (cu as any)['status'] || 'active';
                if (status !== 'active') continue;

                const userId = cu.user_id;
                if (!userId || seenUserIds.has(userId)) continue;
                seenUserIds.add(userId);

                try {
                    const user = await this.userRepo.getUserById(userId);
                    if (!user) continue;

                    const globalRoles: string[] = (user as any).global_roles || [];
                    const isDoctor = globalRoles.some((r: string) => r === 'doctor');
                    if (!isDoctor) continue;

                    const email = ((user as any).email || '').trim().toLowerCase();
                    const name = (user as any).name || email.split('@')[0] || 'Doctor';
                    const specialty = (user as any).specialization || (user as any).specialty || '';
                    const initials = name.split(' ').filter(Boolean).map((w: string) => w[0]?.toUpperCase() || '').join('').slice(0, 2);

                    doctors.push({ id: `dr_${userId}`, name, specialty, avatar: initials, email });
                } catch {
                    // Skip
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
            const clinics = await this.clinicRepo.getClinics(subscriptionId);
            const clinicIds = clinics.map(c => c.id!);
            if (clinicIds.length === 0) return [];

            const doctors: Array<{ id: string; name: string; specialty: string; avatar: string; email: string }> = [];
            const seenUserIds = new Set<string>();

            for (const clinicId of clinicIds) {
                const cuEntries = await this.userRepo.getClinicUsersByClinic(clinicId);

                for (const cu of cuEntries) {
                    const status = (cu as any)['status'] || 'active';
                    if (status !== 'active') continue;

                    const userId = cu.user_id;
                    if (!userId || seenUserIds.has(userId)) continue;
                    seenUserIds.add(userId);

                    try {
                        const user = await this.userRepo.getUserById(userId);
                        if (!user) continue;

                        const globalRoles: string[] = (user as any).global_roles || [];
                        const isDoctor = globalRoles.some((r: string) => r === 'doctor');
                        if (!isDoctor) continue;

                        const email = ((user as any).email || '').trim().toLowerCase();
                        const name = (user as any).name || email.split('@')[0] || 'Doctor';
                        const specialty = (user as any).specialization || (user as any).specialty || '';
                        const initials = name.split(' ').filter(Boolean).map((w: string) => w[0]?.toUpperCase() || '').join('').slice(0, 2);

                        doctors.push({ id: `dr_${userId}`, name, specialty, avatar: initials, email });
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
            const clinics = await this.clinicRepo.getClinics(subscriptionId);
            return clinics
                .filter(c => (c.status || 'active') === 'active')
                .map(c => ({ id: c.id!, name: c.name || c.id! }));
        } catch (error) {
            console.error('getAllClinicsForSubscription failed:', subscriptionId, error);
            return [];
        }
    }



    /**
     * Check whether the subscription linked to a given email is still valid.
     *
     * Returns:
     *   'valid'     — subscription exists and has not expired (or has no valid_until set)
     *   'expired'   — valid_until is in the past
     *   'not_found' — no subscription found for this user
     *
     * z_admin users should bypass this check at the call site.
     */
    async checkSubscriptionExpiry(email: string): Promise<'valid' | 'expired' | 'not_found'> {
        try {
            const subscriptionId = await this.getUserSubscriptionId(email);
            if (!subscriptionId) {
                // Admin-only users (no clinic assignment) — try via subscriptions.owner_email
                const normalized = normalizeEmail(email);
                const allSubs = await this.subscriptionRepo.getSubscriptions();
                const ownerSub = allSubs.find(s => (s as any)['owner_email'] === normalized);
                if (!ownerSub) return 'not_found';
                const validUntil = await this.resolveValidUntil(ownerSub.id, ownerSub as any);
                if (!validUntil) return 'valid';
                return this.configService.isSubscriptionExpired(validUntil) ? 'expired' : 'valid';
            }

            const sub = await this.subscriptionRepo.getSubscriptionById(subscriptionId);
            if (!sub) return 'not_found';

            const validUntil = await this.resolveValidUntil(sub.id, sub as any);
            if (!validUntil) return 'valid';
            return this.configService.isSubscriptionExpired(validUntil) ? 'expired' : 'valid';
        } catch (error) {
            console.warn('[AuthZ] checkSubscriptionExpiry failed for:', email, error);
            return 'valid';
        }
    }

    /**
     * Returns valid_until for a subscription document.
     * If the field is missing (subscription predates the feature), computes it
     * from created_at + plan validity days and writes it back to Firestore.
     */
    private async resolveValidUntil(subId: string, subData: Record<string, any>): Promise<string | null> {
        if (subData['valid_until']) return subData['valid_until'] as string;
        try {
            const planName: string = (subData['plan']?.['name'] ?? subData['plan'] ?? '') as string;
            const validityDays = planName ? await this.configService.getPlanValidityDays(planName) : 0;
            if (!validityDays) return null;
            const baseDate = subData['created_at'] ? new Date(subData['created_at'] as string) : new Date();
            const expiry = new Date(baseDate);
            expiry.setDate(expiry.getDate() + validityDays);
            const valid_until = expiry.toISOString();
            await this.subscriptionRepo.updateSubscription(subId, { valid_until } as any);
            console.debug('[AuthZ] Backfilled valid_until:', valid_until, 'for sub:', subId);
            return valid_until;
        } catch (e) {
            console.warn('[AuthZ] resolveValidUntil backfill failed for sub:', subId, e);
            return null;
        }
    }
}