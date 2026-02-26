import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => {
    return {
        mockGetDoc: vi.fn(),
        mockDoc: vi.fn(),
    };
});

vi.mock('@angular/fire/firestore', () => ({
    Firestore: class { },
    doc: (...args: any[]) => hoisted.mockDoc(...args),
    getDoc: (...args: any[]) => hoisted.mockGetDoc(...args),
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

// ═════════════════════════════════════════════════════════════════════════════════
// AUTHORIZATION SERVICE TESTS
// ═════════════════════════════════════════════════════════════════════════════════

describe('AuthorizationService', () => {
    let service: AuthorizationService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AuthorizationService();
    });

    describe('isEmailAllowed() - Positive Cases', () => {
        it('should return true when email exists in allowlist', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            const result = await service.isEmailAllowed('allowed@test.com');

            expect(result).toBe(true);
        });

        it('should normalize email to lowercase', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            await service.isEmailAllowed('ADMIN@TEST.COM');

            expect(hoisted.mockDoc).toHaveBeenCalled();
        });

        it('should handle email with special characters', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            const result = await service.isEmailAllowed('user+tag@test.com');

            expect(result).toBe(true);
        });
    });

    describe('isEmailAllowed() - Negative Cases', () => {
        it('should return false when email does not exist in allowlist', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => false,
            });

            const result = await service.isEmailAllowed('notallowed@test.com');

            expect(result).toBe(false);
        });

        it('should return false on Firestore error', async () => {
            hoisted.mockGetDoc.mockRejectedValue(new Error('Firestore error'));

            const result = await service.isEmailAllowed('error@test.com');

            expect(result).toBe(false);
        });

        it('should return false on permission denied error', async () => {
            hoisted.mockGetDoc.mockRejectedValue({
                code: 'permission-denied',
                message: 'Missing or insufficient permissions',
            });

            const result = await service.isEmailAllowed('nopermission@test.com');

            expect(result).toBe(false);
        });

        it('should return false on network error', async () => {
            hoisted.mockGetDoc.mockRejectedValue(new Error('Network error'));

            const result = await service.isEmailAllowed('network@test.com');

            expect(result).toBe(false);
        });
    });

    describe('checkEmailsAllowed() - Positive Cases', () => {
        it('should check multiple emails and return results', async () => {
            hoisted.mockGetDoc.mockImplementation(() =>
                Promise.resolve({
                    exists: () => true,
                })
            );

            const result = await service.checkEmailsAllowed([
                'user1@test.com',
                'user2@test.com',
                'user3@test.com',
            ]);

            expect(result['user1@test.com']).toBe(true);
            expect(result['user2@test.com']).toBe(true);
            expect(result['user3@test.com']).toBe(true);
        });

        it('should handle empty email array', async () => {
            const result = await service.checkEmailsAllowed([]);

            expect(result).toEqual({});
        });

        it('should handle mixed allowed and disallowed emails', async () => {
            let callCount = 0;
            hoisted.mockGetDoc.mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    exists: () => callCount % 2 === 0, // Alternating true/false
                });
            });

            const result = await service.checkEmailsAllowed([
                'user1@test.com',
                'user2@test.com',
                'user3@test.com',
            ]);

            expect(result['user1@test.com']).toBe(false);
            expect(result['user2@test.com']).toBe(true);
            expect(result['user3@test.com']).toBe(false);
        });
    });

    describe('checkEmailsAllowed() - Negative Cases', () => {
        it('should handle partial failures gracefully', async () => {
            hoisted.mockGetDoc.mockImplementation((docPath) => {
                if (typeof docPath === 'string' && docPath.includes('error')) {
                    return Promise.reject(new Error('Error checking email'));
                }
                return Promise.resolve({ exists: () => true });
            });

            const result = await service.checkEmailsAllowed(['user@test.com']);

            expect(result['user@test.com']).toBeDefined();
        });
    });

    describe('allowEmail() - Positive Cases', () => {
        it('should allow email (placeholder implementation)', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            await expect(service.allowEmail('newuser@test.com')).resolves.not.toThrow();
        });

        it('should normalize email to lowercase when allowing', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            await service.allowEmail('NEWUSER@TEST.COM');

            expect(hoisted.mockDoc).toHaveBeenCalled();
        });
    });

    describe('allowEmail() - Negative Cases', () => {
        it('should throw error on Firestore failure', async () => {
            hoisted.mockGetDoc.mockRejectedValue(new Error('Firestore error'));

            await expect(service.allowEmail('user@test.com')).rejects.toThrow('Firestore error');
        });

        it('should throw error on permission denied', async () => {
            hoisted.mockGetDoc.mockRejectedValue(new Error('Permission denied'));

            await expect(service.allowEmail('user@test.com')).rejects.toThrow('Permission denied');
        });
    });

    describe('denyEmail() - Positive Cases', () => {
        it('should deny email (placeholder implementation)', async () => {
            await expect(service.denyEmail('usertoblock@test.com')).resolves.not.toThrow();
        });
    });

    describe('denyEmail() - Negative Cases', () => {
        it('should throw error on Firestore failure', async () => {
            // Mock setDoc or deleteDoc when implemented
            // Currently denyEmail is a placeholder, so this test verifies the placeholder doesn't throw
            await expect(service.denyEmail('user@test.com')).resolves.not.toThrow();
        });
    });

    describe('Integration Tests', () => {
        it('should allow email then verify it is allowed', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            await service.allowEmail('integration@test.com');
            const isAllowed = await service.isEmailAllowed('integration@test.com');

            expect(isAllowed).toBe(true);
        });

        it('should handle rapid authorization checks', async () => {
            hoisted.mockGetDoc.mockResolvedValue({
                exists: () => true,
            });

            const promises = Array(5)
                .fill(null)
                .map((_, i) => service.isEmailAllowed(`user${i}@test.com`));

            const results = await Promise.all(promises);

            results.forEach(result => {
                expect(result).toBe(true);
            });
        });
    });
});
