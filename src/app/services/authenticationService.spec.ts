import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstValueFrom } from 'rxjs';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => {
    return {
        mockSignIn: vi.fn(),
        mockCreateUser: vi.fn(),
        mockSignInWithPopup: vi.fn(),
        mockSignOut: vi.fn(),
        mockUpdateProfile: vi.fn().mockResolvedValue(undefined),
        mockSendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
        mockOnAuthStateChanged: vi.fn((auth: any, cb: any) => { cb(null); return vi.fn(); }),
        MockGoogleAuthProvider: class { },
        mockGetDoc: vi.fn(),
        mockDoc: vi.fn(),
    };
});

vi.mock('@angular/fire/auth', () => ({
    Auth: class { },
    signInWithEmailAndPassword: (a: any, b: any, c: any) => hoisted.mockSignIn(a, b, c),
    createUserWithEmailAndPassword: (a: any, b: any, c: any) => hoisted.mockCreateUser(a, b, c),
    signInWithPopup: (a: any, b: any) => hoisted.mockSignInWithPopup(a, b),
    signOut: (a: any) => hoisted.mockSignOut(a),
    updateProfile: (a: any, b: any) => hoisted.mockUpdateProfile(a, b),
    sendPasswordResetEmail: (a: any, b: any) => hoisted.mockSendPasswordResetEmail(a, b),
    onAuthStateChanged: (a: any, b: any) => hoisted.mockOnAuthStateChanged(a, b),
    GoogleAuthProvider: hoisted.MockGoogleAuthProvider,
}));

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
    ɵɵinjectAttribute: (...args: any[]) => { },
}));

import { AuthenticationService } from './authenticationService';

function mockLocalStorage() {
    const store: Record<string, string> = {};
    const mock = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    };
    Object.defineProperty(global, 'localStorage', { value: mock, writable: true });
    return store;
}

function makeService() {
    mockLocalStorage();
    return new AuthenticationService();
}

function makeFirebaseUser(overrides = {}) {
    return {
        uid: 'firebase-uid-123',
        email: 'doc@test.com',
        displayName: 'Dr Test',
        photoURL: null,
        ...overrides,
    };
}

// ═════════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION SERVICE TESTS
// ═════════════════════════════════════════════════════════════════════════════════

describe('AuthenticationService', () => {
    let service: AuthenticationService;

    beforeEach(() => {
        vi.clearAllMocks();
        hoisted.mockOnAuthStateChanged.mockImplementation((auth: any, cb: any) => {
            cb(null);
            return vi.fn();
        });
        service = makeService();
    });

    describe('initialization', () => {
        it('should initialize current user as null', async () => {
            const currentUser = await firstValueFrom(service.currentUser$);
            expect(currentUser).toBeNull();
        });

        it('should initialize authReady as true', async () => {
            const ready = await firstValueFrom(service.authReady$);
            expect(ready).toBe(true);
        });
    });

    describe('register() - Positive Cases', () => {
        it('should register a new user successfully', async () => {
            const firebaseUser = makeFirebaseUser({ uid: 'new-uid-123' });
            hoisted.mockCreateUser.mockResolvedValue({ user: firebaseUser });

            const result = await service.register('newuser@test.com', 'password123', 'New User');

            expect(result).toBeDefined();
            expect(result.uid).toBeDefined();
        });

        it('should handle user without displayName', async () => {
            const firebaseUser = makeFirebaseUser({ displayName: null, uid: 'no-name-uid' });
            hoisted.mockCreateUser.mockResolvedValue({ user: firebaseUser });

            const result = await service.register('noname@test.com', 'password123', 'Provided Name');

            expect(result.name).toBe('Provided Name');
        });
    });

    describe('register() - Negative Cases', () => {
        it('should throw error on email-already-in-use', async () => {
            const error = { code: 'auth/email-already-in-use' };
            hoisted.mockCreateUser.mockRejectedValue(error);

            await expect(service.register('existing@test.com', 'password123', 'User')).rejects.toThrow(
                'This email is already registered'
            );
        });

        it('should throw error on weak password', async () => {
            const error = { code: 'auth/weak-password' };
            hoisted.mockCreateUser.mockRejectedValue(error);

            await expect(service.register('user@test.com', '123', 'User')).rejects.toThrow(
                'Password is too weak'
            );
        });

        it('should throw error on invalid email', async () => {
            const error = { code: 'auth/invalid-email' };
            hoisted.mockCreateUser.mockRejectedValue(error);

            await expect(service.register('invalid-email', 'password123', 'User')).rejects.toThrow(
                'Invalid email address'
            );
        });
    });

    describe('login() - Positive Cases', () => {
        beforeEach(() => {
            hoisted.mockGetDoc.mockResolvedValue({ exists: () => true });
        });

        it('should login user successfully', async () => {
            const firebaseUser = makeFirebaseUser();
            hoisted.mockSignIn.mockResolvedValue({ user: firebaseUser });

            const result = await service.login('doc@test.com', 'password123');

            expect(result.email).toBe('doc@test.com');
        });

        it('should reject unauthorized user', async () => {
            const firebaseUser = makeFirebaseUser({ email: 'unauthorized@test.com' });
            hoisted.mockSignIn.mockResolvedValue({ user: firebaseUser });
            hoisted.mockGetDoc.mockResolvedValue({ exists: () => false });

            await expect(service.login('unauthorized@test.com', 'password123')).rejects.toThrow(
                'Access denied'
            );
        });
    });

    describe('login() - Negative Cases', () => {
        it('should throw error on user-not-found', async () => {
            const error = { code: 'auth/user-not-found' };
            hoisted.mockSignIn.mockRejectedValue(error);

            await expect(service.login('notfound@test.com', 'password123')).rejects.toThrow(
                'No account found'
            );
        });

        it('should throw error on wrong-password', async () => {
            const error = { code: 'auth/wrong-password' };
            hoisted.mockSignIn.mockRejectedValue(error);

            await expect(service.login('user@test.com', 'wrongpassword')).rejects.toThrow(
                'Incorrect password'
            );
        });

        it('should throw error on too-many-requests', async () => {
            const error = { code: 'auth/too-many-requests' };
            hoisted.mockSignIn.mockRejectedValue(error);

            await expect(service.login('user@test.com', 'password123')).rejects.toThrow(
                'Too many attempts'
            );
        });
    });

    describe('loginWithGoogle() - Positive Cases', () => {
        beforeEach(() => {
            hoisted.mockGetDoc.mockResolvedValue({ exists: () => true });
        });

        it('should login with Google successfully', async () => {
            const firebaseUser = makeFirebaseUser({ uid: 'google-uid-789' });
            hoisted.mockSignInWithPopup.mockResolvedValue({ user: firebaseUser });

            const result = await service.loginWithGoogle();

            expect(result.email).toBe('doc@test.com');
        });
    });

    describe('loginWithGoogle() - Negative Cases', () => {
        it('should throw error on popup-closed-by-user', async () => {
            const error = { code: 'auth/popup-closed-by-user' };
            hoisted.mockSignInWithPopup.mockRejectedValue(error);

            await expect(service.loginWithGoogle()).rejects.toThrow('popup was closed');
        });
    });

    describe('resetPassword() - Positive Cases', () => {
        it('should send password reset email successfully', async () => {
            hoisted.mockSendPasswordResetEmail.mockResolvedValue(undefined);

            await expect(service.resetPassword('user@test.com')).resolves.toBeUndefined();
            expect(hoisted.mockSendPasswordResetEmail).toHaveBeenCalled();
        });
    });

    describe('resetPassword() - Negative Cases', () => {
        it('should throw error for invalid email', async () => {
            const error = { code: 'auth/invalid-email' };
            hoisted.mockSendPasswordResetEmail.mockRejectedValue(error);

            await expect(service.resetPassword('invalid')).rejects.toThrow('Invalid email');
        });
    });

    describe('logout() - Positive Cases', () => {
        it('should logout successfully', async () => {
            hoisted.mockSignOut.mockResolvedValue(undefined);

            await service.logout();

            expect(hoisted.mockSignOut).toHaveBeenCalled();
        });
    });

    describe('logout() - Negative Cases', () => {
        it('should propagate logout errors', async () => {
            const error = new Error('Logout failed');
            hoisted.mockSignOut.mockRejectedValue(error);

            await expect(service.logout()).rejects.toEqual(error);
        });
    });

    describe('isLoggedIn()', () => {
        it('should return false when no user is logged in', () => {
            expect(service.isLoggedIn()).toBe(false);
        });
    });

    describe('getCurrentUserId()', () => {
        it('should return null when no user is logged in', () => {
            expect(service.getCurrentUserId()).toBeNull();
        });
    });

    describe('currentUserValue', () => {
        it('should return null initially', () => {
            expect(service.currentUserValue).toBeNull();
        });
    });
});
