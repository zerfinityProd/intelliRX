import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => {
    return {
        mockGetDocs: vi.fn(),
        mockCollectionGroup: vi.fn(),
        mockQuery: vi.fn(),
        mockWhere: vi.fn(),
    };
});

vi.mock('@angular/fire/firestore', () => ({
    Firestore: class { },
    collectionGroup: (...args: any[]) => hoisted.mockCollectionGroup(...args),
    query: (...args: any[]) => hoisted.mockQuery(...args),
    where: (...args: any[]) => hoisted.mockWhere(...args),
    getDocs: (...args: any[]) => hoisted.mockGetDocs(...args),
    doc: vi.fn(),
    getDoc: vi.fn(),
}));

vi.mock('@angular/core', () => ({
    Injectable: () => (target: any) => target,
    ɵɵdefineInjectable: (...args: any[]) => { },
    ɵɵinject: (...args: any[]) => { },
    ɵsetClassMetadata: (...args: any[]) => { },
    inject: vi.fn((token: any) => {
        if (token.name === 'Firestore') return {};
        return new token();
    }),
}));

// Import AFTER all mocks are defined
import { AuthorizationService } from './authorizationService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake Firestore query snapshot with doc paths and data */
function makeSnapshot(docs: Array<{ path: string; data: Record<string, any> }>) {
    return {
        empty: docs.length === 0,
        docs: docs.map(d => ({
            ref: { path: d.path },
            data: () => d.data,
        })),
    };
}

/** Standard doctor user doc at subscriptions/sub_01/clinics/clinic_01/users/doctor@test.com */
function doctorDoc(email = 'doctor@test.com') {
    return {
        path: `subscriptions/sub_01/clinics/clinic_01/users/${email}`,
        data: {
            email,
            doctor: ['canDelete', 'canEdit', 'canAddPatient', 'canAddVisit', 'canAppointment', 'canCancel'],
        },
    };
}

function receptionistDoc(email = 'recep@test.com') {
    return {
        path: `subscriptions/sub_01/clinics/clinic_01/users/${email}`,
        data: {
            email,
            receptionist: ['canAppointment', 'canCancel', 'canAddPatient'],
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORIZATION SERVICE TESTS (subscription-based)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthorizationService', () => {
    let service: AuthorizationService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AuthorizationService();
        // Clear internal cache between tests
        service.invalidateRolesCache();
    });

    // ── isEmailAllowed ────────────────────────────────────────────────────────
    describe('isEmailAllowed()', () => {
        it('returns true when user doc exists in a clinic', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc()]));

            const result = await service.isEmailAllowed('doctor@test.com');
            expect(result).toBe(true);
        });

        it('returns false when no user doc found', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([]));

            const result = await service.isEmailAllowed('unknown@test.com');
            expect(result).toBe(false);
        });

        it('returns false on Firestore error', async () => {
            hoisted.mockGetDocs.mockRejectedValue(new Error('Firestore error'));

            const result = await service.isEmailAllowed('error@test.com');
            expect(result).toBe(false);
        });

        it('normalizes email to lowercase', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc('admin@test.com')]));

            await service.isEmailAllowed('ADMIN@TEST.COM');

            expect(hoisted.mockWhere).toHaveBeenCalledWith('email', '==', 'admin@test.com');
        });
    });

    // ── getUserRole ───────────────────────────────────────────────────────────
    describe('getUserRole()', () => {
        it('returns "doctor" when user doc has a doctor field', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc()]));

            const role = await service.getUserRole('doctor@test.com');
            expect(role).toBe('doctor');
        });

        it('returns "receptionist" when user doc has a receptionist field', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([receptionistDoc()]));

            const role = await service.getUserRole('recep@test.com');
            expect(role).toBe('receptionist');
        });

        it('defaults to "doctor" when user not found', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([]));

            const role = await service.getUserRole('unknown@test.com');
            expect(role).toBe('doctor');
        });
    });

    // ── getUserPermissions ────────────────────────────────────────────────────
    describe('getUserPermissions()', () => {
        it('returns all doctor permissions as true', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc()]));

            const perms = await service.getUserPermissions('doctor@test.com');
            expect(perms.canDelete).toBe(true);
            expect(perms.canEdit).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canAddVisit).toBe(true);
            expect(perms.canAppointment).toBe(true);
            expect(perms.canCancel).toBe(true);
        });

        it('returns limited receptionist permissions', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([receptionistDoc()]));

            const perms = await service.getUserPermissions('recep@test.com');
            expect(perms.canAppointment).toBe(true);
            expect(perms.canCancel).toBe(true);
            expect(perms.canAddPatient).toBe(true);
            expect(perms.canDelete).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canAddVisit).toBe(false);
        });

        it('returns all-false permissions when user not found', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([]));

            const perms = await service.getUserPermissions('unknown@test.com');
            expect(perms.canDelete).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canAddPatient).toBe(false);
        });
    });

    // ── getUserClinicIds ──────────────────────────────────────────────────────
    describe('getUserClinicIds()', () => {
        it('extracts clinic IDs from doc paths', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([
                doctorDoc('doc@test.com'),
                {
                    path: 'subscriptions/sub_01/clinics/clinic_02/users/doc@test.com',
                    data: { email: 'doc@test.com', doctor: ['canDelete'] },
                },
            ]));

            const clinicIds = await service.getUserClinicIds('doc@test.com');
            expect(clinicIds).toContain('clinic_01');
            expect(clinicIds).toContain('clinic_02');
            expect(clinicIds).toHaveLength(2);
        });
    });

    // ── getUserSubscriptionId ─────────────────────────────────────────────────
    describe('getUserSubscriptionId()', () => {
        it('extracts subscription ID from doc path', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc()]));

            const subId = await service.getUserSubscriptionId('doctor@test.com');
            expect(subId).toBe('sub_01');
        });

        it('returns null when user not found', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([]));

            const subId = await service.getUserSubscriptionId('unknown@test.com');
            expect(subId).toBeNull();
        });
    });

    // ── checkEmailsAllowed ────────────────────────────────────────────────────
    describe('checkEmailsAllowed()', () => {
        it('checks multiple emails', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc('a@test.com')]));

            const result = await service.checkEmailsAllowed(['a@test.com', 'b@test.com']);
            expect(result['a@test.com']).toBeDefined();
            expect(result['b@test.com']).toBeDefined();
        });

        it('handles empty array', async () => {
            const result = await service.checkEmailsAllowed([]);
            expect(result).toEqual({});
        });
    });

    // ── Caching ───────────────────────────────────────────────────────────────
    describe('Caching', () => {
        it('caches user lookup and reuses on second call', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc()]));

            await service.isEmailAllowed('doctor@test.com');
            await service.isEmailAllowed('doctor@test.com');

            // collectionGroup query should only fire once (cached)
            expect(hoisted.mockGetDocs).toHaveBeenCalledTimes(1);
        });

        it('invalidateRolesCache forces re-fetch', async () => {
            hoisted.mockGetDocs.mockResolvedValue(makeSnapshot([doctorDoc()]));

            await service.isEmailAllowed('doctor@test.com');
            service.invalidateRolesCache();
            await service.isEmailAllowed('doctor@test.com');

            expect(hoisted.mockGetDocs).toHaveBeenCalledTimes(2);
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
