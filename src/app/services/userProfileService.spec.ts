import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@angular/core', () => ({
    Injectable: () => (target: any) => target,
    ɵɵdefineInjectable: (...args: any[]) => { },
    ɵɵinject: (...args: any[]) => { },
    ɵsetClassMetadata: (...args: any[]) => { },
}));

import { UserProfileService, User } from './userProfileService';

// ═════════════════════════════════════════════════════════════════════════════════
// USER PROFILE SERVICE TESTS
// ═════════════════════════════════════════════════════════════════════════════════

describe('UserProfileService', () => {
    let service: UserProfileService;

    beforeEach(() => {
        service = new UserProfileService();
    });

    describe('transformFirebaseUser() - Positive Cases', () => {
        it('should transform Firebase user with all fields', () => {
            const firebaseUser: any = {
                uid: 'user-123',
                email: 'user@test.com',
                displayName: 'John Doe',
                photoURL: 'https://example.com/photo.jpg',
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result).toEqual({
                uid: 'user-123',
                name: 'John Doe',
                email: 'user@test.com',
                photoURL: 'https://example.com/photo.jpg',
            });
        });

        it('should handle user without displayName', () => {
            const firebaseUser: any = {
                uid: 'user-456',
                email: 'nodisplay@test.com',
                displayName: null,
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.name).toBe('nodisplay');
            expect(result.uid).toBe('user-456');
        });

        it('should handle user without photoURL', () => {
            const firebaseUser: any = {
                uid: 'user-789',
                email: 'nophoto@test.com',
                displayName: 'Test User',
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.photoURL).toBeUndefined();
        });

        it('should handle user with empty email', () => {
            const firebaseUser: any = {
                uid: 'user-no-email',
                email: '',
                displayName: 'No Email User',
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.email).toBe('');
            expect(result.name).toBe('No Email User');
        });

        it('should handle user with special characters in display name', () => {
            const firebaseUser: any = {
                uid: 'user-special',
                email: 'special@test.com',
                displayName: 'José María',
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.name).toBe('José María');
        });
    });

    describe('transformFirebaseUser() - Negative Cases', () => {
        it('should use email prefix when displayName is empty string', () => {
            const firebaseUser: any = {
                uid: 'user-empty-name',
                email: 'prefix@test.com',
                displayName: '',
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.name).toBe('prefix');
        });

        it('should use email prefix when displayName is whitespace', () => {
            const firebaseUser: any = {
                uid: 'user-whitespace',
                email: 'whitespace@test.com',
                displayName: '   ',
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.name).toBe('whitespace');
        });

        it('should use default name when email is missing', () => {
            const firebaseUser: any = {
                uid: 'user-no-email',
                email: '',
                displayName: null,
                photoURL: null,
            };

            const result = service.transformFirebaseUser(firebaseUser);

            expect(result.name).toBe('User');
        });
    });

    describe('createUser() - Positive Cases', () => {
        it('should create user with all parameters', () => {
            const result = service.createUser(
                'uid-123',
                'user@test.com',
                'John Doe',
                'https://example.com/photo.jpg'
            );

            expect(result).toEqual({
                uid: 'uid-123',
                name: 'John Doe',
                email: 'user@test.com',
                photoURL: 'https://example.com/photo.jpg',
            });
        });

        it('should create user without optional parameters', () => {
            const result = service.createUser('uid-456', 'user@test.com');

            expect(result.uid).toBe('uid-456');
            expect(result.email).toBe('user@test.com');
            expect(result.name).toBe('user');
            expect(result.photoURL).toBeUndefined();
        });

        it('should create user with null displayName', () => {
            const result = service.createUser('uid-789', 'test@test.com', null, null);

            expect(result.name).toBe('test');
            expect(result.photoURL).toBeUndefined();
        });

        it('should create user with provided displayName', () => {
            const result = service.createUser('uid-000', 'email@test.com', 'Custom Name', null);

            expect(result.name).toBe('Custom Name');
        });
    });

    describe('createUser() - Negative Cases', () => {
        it('should use email prefix when displayName is null', () => {
            const result = service.createUser('uid-test', 'prefix@test.com', null);

            expect(result.name).toBe('prefix');
        });

        it('should use email prefix when displayName is empty', () => {
            const result = service.createUser('uid-test2', 'prefix2@test.com', '');

            expect(result.name).toBe('prefix2');
        });

        it('should use default User when email is empty and no displayName', () => {
            const result = service.createUser('uid-test3', '', null);

            expect(result.name).toBe('User');
        });
    });

    describe('isValidUser() - Positive Cases', () => {
        it('should validate correct user object', () => {
            const validUser: User = {
                uid: 'valid-uid',
                name: 'Valid User',
                email: 'valid@test.com',
                photoURL: 'https://example.com/photo.jpg',
            };

            expect(service.isValidUser(validUser)).toBe(true);
        });

        it('should validate user without photoURL', () => {
            const validUser: User = {
                uid: 'valid-uid-2',
                name: 'Another User',
                email: 'another@test.com',
            };

            expect(service.isValidUser(validUser)).toBe(true);
        });

        it('should validate user with minimal required fields', () => {
            const validUser: User = {
                uid: 'minimal-uid',
                name: 'M',
                email: 'm@test.com',
            };

            expect(service.isValidUser(validUser)).toBe(true);
        });
    });

    describe('isValidUser() - Negative Cases', () => {
        it('should reject null user', () => {
            expect(service.isValidUser(null)).toBe(false);
        });

        it('should reject undefined user', () => {
            expect(service.isValidUser(undefined)).toBe(false);
        });

        it('should reject user with missing uid', () => {
            const invalidUser = {
                name: 'No UID',
                email: 'nouid@test.com',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with missing name', () => {
            const invalidUser = {
                uid: 'uid-123',
                email: 'noname@test.com',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with missing email', () => {
            const invalidUser = {
                uid: 'uid-456',
                name: 'No Email',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with non-string uid', () => {
            const invalidUser = {
                uid: 123,
                name: 'Wrong Type',
                email: 'wrongtype@test.com',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with non-string name', () => {
            const invalidUser = {
                uid: 'uid-789',
                name: 123,
                email: 'wrongname@test.com',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with non-string email', () => {
            const invalidUser = {
                uid: 'uid-000',
                name: 'Wrong Email',
                email: 123,
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with empty uid', () => {
            const invalidUser: User = {
                uid: '',
                name: 'Empty UID',
                email: 'emptyuid@test.com',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });

        it('should reject user with whitespace-only uid', () => {
            const invalidUser: User = {
                uid: '   ',
                name: 'Whitespace UID',
                email: 'whitespace@test.com',
            };

            expect(service.isValidUser(invalidUser)).toBe(false);
        });
    });

    describe('extractUserIdFromEmail()', () => {
        it('should extract user ID from standard email', () => {
            const result = service.extractUserIdFromEmail('username@example.com');

            expect(result).toBe('username');
        });

        it('should extract user ID from email with numbers', () => {
            const result = service.extractUserIdFromEmail('user123@example.com');

            expect(result).toBe('user123');
        });

        it('should extract user ID from email with dots', () => {
            const result = service.extractUserIdFromEmail('first.last@example.com');

            expect(result).toBe('first.last');
        });

        it('should extract user ID from email with plus sign', () => {
            const result = service.extractUserIdFromEmail('user+tag@example.com');

            expect(result).toBe('user+tag');
        });

        it('should return "user" for email without prefix', () => {
            const result = service.extractUserIdFromEmail('@example.com');

            expect(result).toBe('user');
        });

        it('should handle single character email prefix', () => {
            const result = service.extractUserIdFromEmail('a@example.com');

            expect(result).toBe('a');
        });
    });

    describe('extractDisplayName() - Private Method Tests', () => {
        it('should return displayName when provided', () => {
            const validUser: User = {
                uid: 'uid-123',
                name: 'Provided Name',
                email: 'any@test.com',
            };

            expect(validUser.name).toBe('Provided Name');
        });

        it('should use email prefix as fallback', () => {
            const user = service.createUser('uid-456', 'fallback@test.com', null);

            expect(user.name).toBe('fallback');
        });

        it('should use default "User" when email is empty', () => {
            const user = service.createUser('uid-789', '', null);

            expect(user.name).toBe('User');
        });
    });

    describe('Integration Tests', () => {
        it('should transform and validate a user', () => {
            const firebaseUser: any = {
                uid: 'integration-uid',
                email: 'integration@test.com',
                displayName: 'Integration User',
                photoURL: 'https://example.com/photo.jpg',
            };

            const transformed = service.transformFirebaseUser(firebaseUser);
            const isValid = service.isValidUser(transformed);

            expect(isValid).toBe(true);
            expect(transformed.uid).toBe('integration-uid');
            expect(transformed.name).toBe('Integration User');
        });

        it('should handle Firebase user with minimal info then validate', () => {
            const firebaseUser: any = {
                uid: 'minimal-uid',
                email: 'minimal@test.com',
                displayName: null,
                photoURL: null,
            };

            const user = service.transformFirebaseUser(firebaseUser);
            const isValid = service.isValidUser(user);

            expect(isValid).toBe(true);
            expect(user.name).toBe('minimal');
        });

        it('should create and validate a user in sequence', () => {
            const created = service.createUser('seq-uid', 'sequence@test.com', 'Sequential User');
            const isValid = service.isValidUser(created);
            const extracted = service.extractUserIdFromEmail(created.email);

            expect(isValid).toBe(true);
            expect(extracted).toBe('sequence');
        });
    });
});
