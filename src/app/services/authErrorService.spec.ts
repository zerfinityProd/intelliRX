import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@angular/core', () => ({
    Injectable: () => (target: any) => target,
    ɵɵdefineInjectable: (...args: any[]) => { },
    ɵɵinject: (...args: any[]) => { },
    ɵsetClassMetadata: (...args: any[]) => { },
}));

import { AuthErrorService } from './authErrorService';

// ═════════════════════════════════════════════════════════════════════════════════
// AUTH ERROR SERVICE TESTS
// ═════════════════════════════════════════════════════════════════════════════════

describe('AuthErrorService', () => {
    let service: AuthErrorService;

    beforeEach(() => {
        service = new AuthErrorService();
    });

    describe('handleAuthError() - Positive Cases', () => {
        it('should map email-already-in-use error', () => {
            const error = { code: 'auth/email-already-in-use', message: 'Email already exists' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('This email is already registered');
        });

        it('should map invalid-email error', () => {
            const error = { code: 'auth/invalid-email', message: 'Invalid email format' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Invalid email address');
        });

        it('should map operation-not-allowed error', () => {
            const error = { code: 'auth/operation-not-allowed', message: 'Operation not allowed' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('This operation is not allowed');
        });

        it('should map weak-password error', () => {
            const error = { code: 'auth/weak-password', message: 'Password too weak' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Password is too weak. Use at least 6 characters');
        });

        it('should map user-disabled error', () => {
            const error = { code: 'auth/user-disabled', message: 'User account disabled' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('This account has been disabled');
        });

        it('should map user-not-found error', () => {
            const error = { code: 'auth/user-not-found', message: 'User not found' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('No account found with this email');
        });

        it('should map wrong-password error', () => {
            const error = { code: 'auth/wrong-password', message: 'Password incorrect' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Incorrect password');
        });

        it('should map invalid-credential error', () => {
            const error = { code: 'auth/invalid-credential', message: 'Invalid credentials' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Invalid email or password');
        });

        it('should map too-many-requests error', () => {
            const error = { code: 'auth/too-many-requests', message: 'Too many login attempts' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Too many attempts. Please try again later');
        });

        it('should map network-request-failed error', () => {
            const error = { code: 'auth/network-request-failed', message: 'Network error' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Network error. Please check your connection');
        });

        it('should map popup-closed-by-user error', () => {
            const error = { code: 'auth/popup-closed-by-user', message: 'Popup closed' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Sign-in popup was closed');
        });

        it('should return Error instance', () => {
            const error = { code: 'auth/user-not-found' };

            const result = service.handleAuthError(error);

            expect(result).toBeInstanceOf(Error);
        });

        it('should preserve error message property', () => {
            const error = { code: 'auth/user-not-found' };

            const result = service.handleAuthError(error);

            expect(result.message).toEqual(expect.any(String));
        });
    });

    describe('handleAuthError() - Negative Cases', () => {
        it('should use default message for unknown error code', () => {
            const error = { code: 'auth/unknown-error' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('An error occurred during authentication');
        });

        it('should use custom message from error object if available', () => {
            const error = { code: 'custom/unknown-code', message: 'Custom error message' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Custom error message');
        });

        it('should handle error with no code property', () => {
            const error = { message: 'Some error' };

            const result = service.handleAuthError(error);

            expect(result.message).toBe('Some error');
        });

        it('should use default message when error has no message property', () => {
            const error = { code: 'unknown/code' };

            const result = service.handleAuthError(error);

            expect(result.message).toEqual(expect.any(String));
        });

        it('should handle null error gracefully', () => {
            const error = null;

            const result = service.handleAuthError(error);

            expect(result).toBeInstanceOf(Error);
        });

        it('should handle undefined error gracefully', () => {
            const error = undefined;

            const result = service.handleAuthError(error);

            expect(result).toBeInstanceOf(Error);
        });

        it('should handle error as string', () => {
            const error = 'Some string error';

            const result = service.handleAuthError(error);

            expect(result).toBeInstanceOf(Error);
        });
    });

    describe('isAuthError() - Positive Cases', () => {
        it('should identify Firebase auth error with auth/ prefix', () => {
            const error = { code: 'auth/user-not-found' };

            const result = service.isAuthError(error);

            expect(result).toBe(true);
        });

        it('should identify Firebase auth error with various codes', () => {
            const codes = [
                'auth/email-already-in-use',
                'auth/weak-password',
                'auth/network-request-failed',
                'auth/user-disabled',
            ];

            codes.forEach(code => {
                const error = { code };
                expect(service.isAuthError(error)).toBe(true);
            });
        });

        it('should identify Firebase auth error even with no code property name', () => {
            const error: any = {};
            error.code = 'auth/some-error';

            expect(service.isAuthError(error)).toBe(true);
        });
    });

    describe('isAuthError() - Negative Cases', () => {
        it('should not identify non-auth errors', () => {
            const error = { code: 'firestore/not-found' };

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });

        it('should not identify error without code property', () => {
            const error = { message: 'Some error' };

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });

        it('should not identify null as auth error', () => {
            const error = null;

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });

        it('should not identify undefined as auth error', () => {
            const error = undefined;

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });

        it('should not identify custom/auth as auth error', () => {
            const error = { code: 'custom/auth/error' };

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });

        it('should not identify error with empty code', () => {
            const error = { code: '' };

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });

        it('should not identify error with auth in middle of code', () => {
            const error = { code: 'firebase/auth/error' };

            const result = service.isAuthError(error);

            expect(result).toBe(false);
        });
    });

    describe('Error Message Coverage', () => {
        it('should provide user-friendly messages for all Firebase auth codes', () => {
            const authCodes = [
                'auth/email-already-in-use',
                'auth/invalid-email',
                'auth/operation-not-allowed',
                'auth/weak-password',
                'auth/user-disabled',
                'auth/user-not-found',
                'auth/wrong-password',
                'auth/invalid-credential',
                'auth/too-many-requests',
                'auth/network-request-failed',
                'auth/popup-closed-by-user',
            ];

            authCodes.forEach(code => {
                const error = { code };
                const result = service.handleAuthError(error);

                expect(result.message).not.toContain(code);
                expect(result.message.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Integration Tests', () => {
        it('should handle error, check if auth error, and convert message', () => {
            const rawError = { code: 'auth/user-not-found' };

            const isAuthErr = service.isAuthError(rawError);
            const handledError = service.handleAuthError(rawError);

            expect(isAuthErr).toBe(true);
            expect(handledError.message).toBe('No account found with this email');
        });

        it('should handle chain of errors', () => {
            const errors = [
                { code: 'auth/user-not-found' },
                { code: 'auth/wrong-password' },
                { code: 'auth/too-many-requests' },
            ];

            errors.forEach(error => {
                const isAuth = service.isAuthError(error);
                const handled = service.handleAuthError(error);

                expect(isAuth).toBe(true);
                expect(handled).toBeInstanceOf(Error);
            });
        });

        it('should filter auth errors from mixed error types', () => {
            const errors = [
                { code: 'auth/user-not-found' },
                { code: 'firestore/not-found' },
                { code: 'auth/wrong-password' },
                { code: 'storage/not-found' },
            ];

            const authErrors = errors.filter(err => service.isAuthError(err));

            expect(authErrors.length).toBe(2);
            expect(authErrors.every(err => service.isAuthError(err))).toBe(true);
        });
    });
});
