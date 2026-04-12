import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => {
    return {
        mockGetDocs: vi.fn(),
        mockGetDoc: vi.fn(),
        mockQuery: vi.fn(),
        mockWhere: vi.fn(),
        mockCollection: vi.fn(),
        mockDoc: vi.fn(),
        mockUpdateDoc: vi.fn(),
        mockDeleteField: vi.fn(),
        /** Mock ClinicContextService: selectedClinicId returned by getSelectedClinicId() */
        selectedClinicId: null as string | null,
    };
});

vi.mock('@angular/fire/firestore', () => ({
    Firestore: class { },
    collection: (...args: any[]) => hoisted.mockCollection(...args),
    query: (...args: any[]) => hoisted.mockQuery(...args),
    where: (...args: any[]) => hoisted.mockWhere(...args),
    getDocs: (...args: any[]) => hoisted.mockGetDocs(...args),
    doc: (...args: any[]) => hoisted.mockDoc(...args),
    getDoc: (...args: any[]) => hoisted.mockGetDoc(...args),
    updateDoc: (...args: any[]) => hoisted.mockUpdateDoc(...args),
    deleteField: () => hoisted.mockDeleteField(),
}));

vi.mock('@angular/core', () => ({
    Injectable: () => (target: any) => target,
    ɵɵdefineInjectable: (...args: any[]) => { },
    ɵɵinject: (...args: any[]) => { },
    ɵsetClassMetadata: (...args: any[]) => { },
    inject: vi.fn((token: any) => {
        if (token.name === 'Firestore') return {};
        // Return mock ClinicContextService
        if (token.name === 'ClinicContextService') {
            return {
                getSelectedClinicId: () => hoisted.selectedClinicId,
                getSubscriptionId: () => null,
            };
        }
        return new token();
    }),
}));

// Import AFTER all mocks are defined
import { AuthorizationService } from './authorizationService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake Firestore query snapshot with docs */
function makeQuerySnapshot(docs: Array<{ id: string; data: Record<string, any> }>) {
    return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs.map(d => ({
            id: d.id,
            data: () => d.data,
        })),
    };
}

/** Build a fake single-doc snapshot */
function makeDocSnapshot(data: Record<string, any> | null) {
    return {
        exists: () => data !== null,
        data: () => data,
    };
}

// ─── Standard test data ──────────────────────────────────────────────────────

const DOCTOR_USER = { id: 'user_doc', data: { email: 'doctor@test.com', name: 'Dr. Test', global_roles: ['doctor'] } };
const RECEP_USER = { id: 'user_recep', data: { email: 'recep@test.com', name: 'Receptionist', global_roles: ['receptionist'] } };

const DOCTOR_CU = {
    id: 'cu_doc',
    data: {
        subscription_id: 'sub_01', clinic_id: 'clinic_01', user_id: 'user_doc',
        roles: ['doctor'], status: 'active',
    },
};

const RECEP_CU = {
    id: 'cu_recep',
    data: {
        subscription_id: 'sub_01', clinic_id: 'clinic_01', user_id: 'user_recep',
        roles: ['receptionist'], status: 'active',
    },
};

const DOCTOR_ROLE_PERMS = ['canDelete', 'canEdit', 'canAddPatient', 'canAddVisit', 'canAppointment', 'canCancel'];
const RECEP_ROLE_PERMS = ['canAppointment', 'canCancel', 'canAddPatient'];

/**
 * Helper: Set up getDocs to return users and clinic_users in sequence.
 * Call order: first getDocs → users collection, second getDocs → clinic_users.
 */
function setupUserLookup(
    userDocs: Array<{ id: string; data: Record<string, any> }>,
    cuDocs: Array<{ id: string; data: Record<string, any> }>,
) {
    let callCount = 0;
    hoisted.mockGetDocs.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 1) return Promise.resolve(makeQuerySnapshot(userDocs));
        return Promise.resolve(makeQuerySnapshot(cuDocs));
    });
}

/**
 * Helper: Set up getDoc to return docs based on the path argument.
 * pathMap: { 'roles/doctor': { permissions: [...] }, 'subscriptions/sub_01': { ... }, ... }
 */
function setupDocReads(pathMap: Record<string, Record<string, any> | null>) {
    hoisted.mockDoc.mockImplementation((_firestore: any, ...pathSegments: string[]) => {
        const fullPath = pathSegments.join('/');
        return { __path: fullPath };
    });
    hoisted.mockGetDoc.mockImplementation((docRef: any) => {
        const path = docRef?.__path || '';
        if (path in pathMap) {
            return Promise.resolve(makeDocSnapshot(pathMap[path]));
        }
        return Promise.resolve(makeDocSnapshot(null));
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORIZATION SERVICE TESTS (hierarchical permissions)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthorizationService', () => {
    let service: AuthorizationService;

    beforeEach(() => {
        vi.clearAllMocks();
        hoisted.selectedClinicId = null;
        service = new AuthorizationService();
        service.invalidateRolesCache();
    });

    // ── isEmailAllowed ────────────────────────────────────────────────────────
    describe('isEmailAllowed()', () => {
        it('returns true when user doc exists', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            const result = await service.isEmailAllowed('doctor@test.com');
            expect(result).toBe(true);
        });

        it('returns false when no user doc found', async () => {
            setupUserLookup([], []);
            const result = await service.isEmailAllowed('unknown@test.com');
            expect(result).toBe(false);
        });

        it('returns false on Firestore error', async () => {
            hoisted.mockGetDocs.mockRejectedValue(new Error('Firestore error'));
            const result = await service.isEmailAllowed('error@test.com');
            expect(result).toBe(false);
        });

        it('normalizes email to lowercase', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            await service.isEmailAllowed('DOCTOR@TEST.COM');
            expect(hoisted.mockWhere).toHaveBeenCalledWith('email', '==', 'doctor@test.com');
        });
    });

    // ── getUserRole ───────────────────────────────────────────────────────────
    describe('getUserRole()', () => {
        it('returns "doctor" for a doctor user', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            const role = await service.getUserRole('doctor@test.com');
            expect(role).toBe('doctor');
        });

        it('returns "receptionist" for a receptionist user', async () => {
            setupUserLookup([RECEP_USER], [RECEP_CU]);
            const role = await service.getUserRole('recep@test.com');
            expect(role).toBe('receptionist');
        });

        it('defaults to "doctor" when user not found', async () => {
            setupUserLookup([], []);
            const role = await service.getUserRole('unknown@test.com');
            expect(role).toBe('doctor');
        });
    });

    // ── getUserPermissions — Layer 1: Global role defaults ────────────────────
    describe('getUserPermissions() — Layer 1 (global role defaults)', () => {
        it('returns doctor permissions from roles/{role} doc', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canDelete).toBe(true);
            expect(perms.canEdit).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canAddVisit).toBe(true);
            expect(perms.canAppointment).toBe(true);
            expect(perms.canCancel).toBe(true);
        });

        it('returns limited receptionist permissions from roles/{role} doc', async () => {
            setupUserLookup([RECEP_USER], [RECEP_CU]);
            setupDocReads({
                'roles/receptionist': { permissions: RECEP_ROLE_PERMS },
            });

            const perms = await service.getUserPermissions('recep@test.com');
            expect(perms.canAppointment).toBe(true);
            expect(perms.canCancel).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canDelete).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canAddVisit).toBe(false);
        });

        it('returns all-false permissions when user not found', async () => {
            setupUserLookup([], []);
            const perms = await service.getUserPermissions('unknown@test.com');
            expect(perms.canDelete).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canAddPatient).toBe(false);
        });
    });

    // ── getUserPermissions — Layer 2: Subscription overrides ──────────────────
    describe('getUserPermissions() — Layer 2 (subscription overrides)', () => {
        it('subscription permissions override global role defaults', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'subscriptions/sub_01': {
                    permissions: {
                        doctor: ['canEdit', 'canAddPatient', 'canAddVisit'],  // removed canDelete
                    },
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canDelete).toBe(false);  // removed at subscription level
            expect(perms.canEdit).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canAddVisit).toBe(true);
            expect(perms.canAppointment).toBe(false);  // not in subscription override
        });

        it('subscription without permissions for this role falls through to Layer 1', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'subscriptions/sub_01': {
                    permissions: {
                        receptionist: ['canAppointment'],  // only receptionist defined, not doctor
                    },
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            // Should fall through to Layer 1 (all doctor perms)
            expect(perms.canDelete).toBe(true);
            expect(perms.canEdit).toBe(true);
        });
    });

    // ── getUserPermissions — Layer 3: Clinic overrides ────────────────────────
    describe('getUserPermissions() — Layer 3 (clinic overrides)', () => {
        it('clinic permissions override subscription permissions', async () => {
            hoisted.selectedClinicId = 'clinic_01';
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'subscriptions/sub_01': {
                    permissions: {
                        doctor: ['canEdit', 'canAddPatient', 'canAddVisit', 'canAppointment'],
                    },
                },
                'clinics/clinic_01': {
                    permissions: {
                        doctor: ['canEdit', 'canAddPatient'],  // further restricted
                    },
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canEdit).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canAddVisit).toBe(false);
            expect(perms.canAppointment).toBe(false);
            expect(perms.canDelete).toBe(false);
        });

        it('no clinic selected → skips Layer 3', async () => {
            hoisted.selectedClinicId = null;
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'clinics/clinic_01': {
                    permissions: { doctor: ['canEdit'] },  // this should be ignored
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            // Should use Layer 1 defaults (all perms)
            expect(perms.canDelete).toBe(true);
            expect(perms.canEdit).toBe(true);
        });
    });

    // ── getUserPermissions — Layer 4: Individual (clinic_user) overrides ──────
    describe('getUserPermissions() — Layer 4 (clinic_user overrides)', () => {
        it('clinic_user permissions override all lower layers', async () => {
            hoisted.selectedClinicId = 'clinic_01';
            const cuWithPerms = {
                id: 'cu_doc',
                data: {
                    ...DOCTOR_CU.data,
                    permissions: ['canEdit'],  // only canEdit at individual level
                },
            };
            setupUserLookup([DOCTOR_USER], [cuWithPerms]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'subscriptions/sub_01': {
                    permissions: { doctor: ['canEdit', 'canAddPatient', 'canAddVisit'] },
                },
                'clinics/clinic_01': {
                    permissions: { doctor: ['canEdit', 'canAddPatient'] },
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canEdit).toBe(true);
            expect(perms.canAddPatient).toBe(false);  // overridden at Layer 4
            expect(perms.canAddVisit).toBe(false);
            expect(perms.canDelete).toBe(false);
        });

        it('clinic_user without permissions falls through to Layer 3', async () => {
            hoisted.selectedClinicId = 'clinic_01';
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);  // no permissions on clinic_user
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'clinics/clinic_01': {
                    permissions: { doctor: ['canEdit', 'canAddPatient'] },
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canEdit).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canAddVisit).toBe(false);  // from Layer 3
        });
    });

    // ── getUserPermissions — Layer 5: User-doc overrides (super override) ─────
    describe('getUserPermissions() — Layer 5 (user-doc super override)', () => {
        it('user-doc permissions override ALL layers', async () => {
            hoisted.selectedClinicId = 'clinic_01';
            const userWithPerms = {
                id: 'user_doc',
                data: {
                    ...DOCTOR_USER.data,
                    permissions: ['canDelete'],  // super override: only canDelete
                },
            };
            const cuWithPerms = {
                id: 'cu_doc',
                data: { ...DOCTOR_CU.data, permissions: ['canEdit', 'canAddPatient'] },
            };
            setupUserLookup([userWithPerms], [cuWithPerms]);
            setupDocReads({
                'roles/doctor': { permissions: DOCTOR_ROLE_PERMS },
                'subscriptions/sub_01': {
                    permissions: { doctor: ['canEdit', 'canAddPatient', 'canAddVisit'] },
                },
                'clinics/clinic_01': {
                    permissions: { doctor: ['canEdit', 'canAddPatient'] },
                },
            });

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canDelete).toBe(true);   // from user-doc override
            expect(perms.canEdit).toBe(false);     // NOT from lower layers
            expect(perms.canAddPatient).toBe(false);
        });
    });

    // ── getUserClinicIds ──────────────────────────────────────────────────────
    describe('getUserClinicIds()', () => {
        it('extracts clinic IDs from clinic_users entries', async () => {
            const cu1 = { ...DOCTOR_CU };
            const cu2 = {
                id: 'cu_doc2',
                data: {
                    subscription_id: 'sub_01', clinic_id: 'clinic_02', user_id: 'user_doc',
                    roles: ['doctor'], status: 'active',
                },
            };
            setupUserLookup([DOCTOR_USER], [cu1, cu2]);

            const clinicIds = await service.getUserClinicIds('doctor@test.com');
            expect(clinicIds).toContain('clinic_01');
            expect(clinicIds).toContain('clinic_02');
            expect(clinicIds).toHaveLength(2);
        });
    });

    // ── getUserSubscriptionId ─────────────────────────────────────────────────
    describe('getUserSubscriptionId()', () => {
        it('extracts subscription ID from clinic_users', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            const subId = await service.getUserSubscriptionId('doctor@test.com');
            expect(subId).toBe('sub_01');
        });

        it('returns null when user not found', async () => {
            setupUserLookup([], []);
            const subId = await service.getUserSubscriptionId('unknown@test.com');
            expect(subId).toBeNull();
        });
    });

    // ── checkEmailsAllowed ────────────────────────────────────────────────────
    describe('checkEmailsAllowed()', () => {
        it('checks multiple emails', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);
            const result = await service.checkEmailsAllowed(['doctor@test.com', 'other@test.com']);
            expect(result['doctor@test.com']).toBeDefined();
            expect(result['other@test.com']).toBeDefined();
        });

        it('handles empty array', async () => {
            const result = await service.checkEmailsAllowed([]);
            expect(result).toEqual({});
        });
    });

    // ── Caching ───────────────────────────────────────────────────────────────
    describe('Caching', () => {
        it('caches user lookup and reuses on second call', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);

            await service.isEmailAllowed('doctor@test.com');
            await service.isEmailAllowed('doctor@test.com');

            // getDocs called twice on first call (users + clinic_users), then cached
            expect(hoisted.mockGetDocs).toHaveBeenCalledTimes(2);
        });

        it('invalidateRolesCache forces re-fetch', async () => {
            setupUserLookup([DOCTOR_USER], [DOCTOR_CU]);

            await service.isEmailAllowed('doctor@test.com');
            service.invalidateRolesCache();
            await service.isEmailAllowed('doctor@test.com');

            // 2 calls per lookup × 2 lookups = 4
            expect(hoisted.mockGetDocs).toHaveBeenCalledTimes(4);
        });
    });

    // ── Placeholder methods ───────────────────────────────────────────────────
    describe('allowEmail / denyEmail (placeholders)', () => {
        it('allowEmail does not throw', async () => {
            await expect(service.allowEmail('new@test.com')).resolves.not.toThrow();
        });

        it('denyEmail does not throw', async () => {
            await expect(service.denyEmail('old@test.com')).resolves.not.toThrow();
        });
    });
});
