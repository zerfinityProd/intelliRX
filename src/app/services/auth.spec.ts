import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstValueFrom } from 'rxjs';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => {
  return {
    mockSignIn:                 vi.fn(),
    mockCreateUser:             vi.fn(),
    mockSignInWithPopup:        vi.fn(),
    mockSignOut:                vi.fn(),
    mockUpdateProfile:          vi.fn().mockResolvedValue(undefined),
    mockSendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    mockOnAuthStateChanged:     vi.fn((auth: any, cb: any) => { cb(null); return vi.fn(); }),
    MockGoogleAuthProvider:     class {},
  };
});

vi.mock('@angular/fire/auth', () => ({
  Auth:                           class {},
  signInWithEmailAndPassword:     (a: any, b: any, c: any) => hoisted.mockSignIn(a, b, c),
  createUserWithEmailAndPassword: (a: any, b: any, c: any) => hoisted.mockCreateUser(a, b, c),
  signInWithPopup:                (a: any, b: any)         => hoisted.mockSignInWithPopup(a, b),
  signOut:                        (a: any)                 => hoisted.mockSignOut(a),
  updateProfile:                  (a: any, b: any)         => hoisted.mockUpdateProfile(a, b),
  sendPasswordResetEmail:         (a: any, b: any)         => hoisted.mockSendPasswordResetEmail(a, b),
  onAuthStateChanged:             (a: any, b: any)         => hoisted.mockOnAuthStateChanged(a, b),
  GoogleAuthProvider:             hoisted.MockGoogleAuthProvider,
}));

vi.mock('@angular/core', () => ({
  Injectable: () => (target: any) => target,
  ɵɵdefineInjectable: (...args: any[]) => {},
  ɵɵinject: (...args: any[]) => {},
  ɵsetClassMetadata: (...args: any[]) => {},
  ɵɵinjectAttribute: (...args: any[]) => {},
}));

// Import AFTER all mocks are defined
import { AuthService } from './auth';

// ─── Mock localStorage (Node has no Storage/localStorage) ─────────────────────
function mockLocalStorage() {
  const store: Record<string, string> = {};
  const mock = {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
  };
  Object.defineProperty(global, 'localStorage', { value: mock, writable: true });
  return store;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeService(currentUser: any = null) {
  mockLocalStorage();
  const authMock = { currentUser };
  return { service: new AuthService(authMock as any), authMock };
}

function makeFirebaseUser(overrides = {}) {
  return {
    uid:         'firebase-uid-123',
    email:       'doc@test.com',
    displayName: 'Dr Test',
    photoURL:    null,
    ...overrides,
  };
}

function makeUserCredential(user = makeFirebaseUser()) {
  return { user };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('AuthService', () => {

  let service: AuthService;
  let authMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: onAuthStateChanged calls callback with null (no user)
    hoisted.mockOnAuthStateChanged.mockImplementation((auth: any, cb: any) => {
      cb(null);
      return vi.fn();
    });
    ({ service, authMock } = makeService());
  });

  // ── Initial state ────────────────────────────────────────────────────────────
  describe('Initial state', () => {
    it('currentUserValue is null when no stored user', () => {
      expect(service.currentUserValue).toBeNull();
    });

    it('currentUser$ emits null initially', async () => {
      const user = await firstValueFrom(service.currentUser$);
      expect(user).toBeNull();
    });
  });

  // ── isLoggedIn ────────────────────────────────────────────────────────────────
  describe('isLoggedIn', () => {
    it('returns false when currentUserValue is null', () => {
      expect(service.isLoggedIn()).toBe(false);
    });

    it('returns false when auth.currentUser is null', () => {
      authMock.currentUser = null;
      expect(service.isLoggedIn()).toBe(false);
    });
  });

  // ── getCurrentUserId ──────────────────────────────────────────────────────────
  describe('getCurrentUserId', () => {
    it('returns null when no firebase user', () => {
      authMock.currentUser = null;
      expect(service.getCurrentUserId()).toBeNull();
    });

    it('returns uid when firebase user is present', () => {
      authMock.currentUser = { uid: 'user-abc-123' };
      expect(service.getCurrentUserId()).toBe('user-abc-123');
    });
  });

  // ── onAuthStateChanged ────────────────────────────────────────────────────────
  describe('onAuthStateChanged', () => {
    it('sets currentUser when Firebase emits a logged-in user', () => {
      const fbUser = makeFirebaseUser();
      hoisted.mockOnAuthStateChanged.mockImplementationOnce((auth: any, cb: any) => {
        cb(fbUser);
        return vi.fn();
      });
      const { service: svc } = makeService();
      expect(svc.currentUserValue).toMatchObject({ uid: 'firebase-uid-123', email: 'doc@test.com' });
    });

    it('clears currentUser when Firebase emits null', () => {
      hoisted.mockOnAuthStateChanged.mockImplementationOnce((auth: any, cb: any) => {
        cb(null);
        return vi.fn();
      });
      const { service: svc } = makeService();
      expect(svc.currentUserValue).toBeNull();
    });

    it('uses email prefix as name when displayName is null', () => {
      const fbUser = makeFirebaseUser({ displayName: null, email: 'doctor@clinic.com' });
      hoisted.mockOnAuthStateChanged.mockImplementationOnce((auth: any, cb: any) => {
        cb(fbUser);
        return vi.fn();
      });
      const { service: svc } = makeService();
      expect(svc.currentUserValue?.name).toBe('doctor');
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('calls signInWithEmailAndPassword with correct args', async () => {
      hoisted.mockSignIn.mockResolvedValueOnce(makeUserCredential());
      await service.login('doc@test.com', 'password123');
      expect(hoisted.mockSignIn).toHaveBeenCalledWith(authMock, 'doc@test.com', 'password123');
    });

    it('returns a User object on success', async () => {
      hoisted.mockSignIn.mockResolvedValueOnce(makeUserCredential());
      const result = await service.login('doc@test.com', 'password123');
      expect(result).toMatchObject({ uid: 'firebase-uid-123', email: 'doc@test.com' });
    });

    it('sets currentUserValue after successful login', async () => {
      hoisted.mockSignIn.mockResolvedValueOnce(makeUserCredential());
      await service.login('doc@test.com', 'password123');
      expect(service.currentUserValue).toMatchObject({ uid: 'firebase-uid-123' });
    });

    it('throws friendly error for auth/user-not-found', async () => {
      hoisted.mockSignIn.mockRejectedValueOnce({ code: 'auth/user-not-found' });
      await expect(service.login('wrong@test.com', 'pass')).rejects.toThrow('No account found with this email');
    });

    it('throws friendly error for auth/wrong-password', async () => {
      hoisted.mockSignIn.mockRejectedValueOnce({ code: 'auth/wrong-password' });
      await expect(service.login('doc@test.com', 'wrong')).rejects.toThrow('Incorrect password');
    });

    it('throws friendly error for auth/invalid-credential', async () => {
      hoisted.mockSignIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
      await expect(service.login('doc@test.com', 'wrong')).rejects.toThrow('Invalid email or password');
    });

    it('throws friendly error for auth/too-many-requests', async () => {
      hoisted.mockSignIn.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
      await expect(service.login('doc@test.com', 'pass')).rejects.toThrow('Too many attempts');
    });
  });

  // ── register ──────────────────────────────────────────────────────────────────
  describe('register', () => {
    it('calls createUserWithEmailAndPassword with correct args', async () => {
      hoisted.mockCreateUser.mockResolvedValueOnce(makeUserCredential());
      await service.register('new@test.com', 'password123', 'Dr New');
      expect(hoisted.mockCreateUser).toHaveBeenCalledWith(authMock, 'new@test.com', 'password123');
    });

    it('calls updateProfile with display name', async () => {
      hoisted.mockCreateUser.mockResolvedValueOnce(makeUserCredential());
      await service.register('new@test.com', 'password123', 'Dr New');
      expect(hoisted.mockUpdateProfile).toHaveBeenCalledWith(
        expect.anything(),
        { displayName: 'Dr New' }
      );
    });

    it('returns a User object on success', async () => {
      hoisted.mockCreateUser.mockResolvedValueOnce(makeUserCredential());
      const result = await service.register('new@test.com', 'password123', 'Dr New');
      expect(result).toMatchObject({ name: 'Dr New' });
    });

    it('throws friendly error for auth/email-already-in-use', async () => {
      hoisted.mockCreateUser.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
      await expect(service.register('dup@test.com', 'pass', 'Dr')).rejects.toThrow('This email is already registered');
    });

    it('throws friendly error for auth/weak-password', async () => {
      hoisted.mockCreateUser.mockRejectedValueOnce({ code: 'auth/weak-password' });
      await expect(service.register('new@test.com', '123', 'Dr')).rejects.toThrow('Password is too weak');
    });
  });

  // ── loginWithGoogle ───────────────────────────────────────────────────────────
  describe('loginWithGoogle', () => {
    it('calls signInWithPopup', async () => {
      hoisted.mockSignInWithPopup.mockResolvedValueOnce(makeUserCredential());
      await service.loginWithGoogle();
      expect(hoisted.mockSignInWithPopup).toHaveBeenCalledOnce();
    });

    it('returns a User object on success', async () => {
      hoisted.mockSignInWithPopup.mockResolvedValueOnce(makeUserCredential());
      const result = await service.loginWithGoogle();
      expect(result).toMatchObject({ uid: 'firebase-uid-123' });
    });

    it('throws friendly error for auth/popup-closed-by-user', async () => {
      hoisted.mockSignInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
      await expect(service.loginWithGoogle()).rejects.toThrow('Sign-in popup was closed');
    });
  });

  // ── resetPassword ─────────────────────────────────────────────────────────────
  describe('resetPassword', () => {
    it('calls sendPasswordResetEmail with correct email', async () => {
      await service.resetPassword('doc@test.com');
      expect(hoisted.mockSendPasswordResetEmail).toHaveBeenCalledWith(authMock, 'doc@test.com');
    });

    it('throws friendly error for auth/user-not-found', async () => {
      hoisted.mockSendPasswordResetEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
      await expect(service.resetPassword('ghost@test.com')).rejects.toThrow('No account found with this email');
    });

    it('throws friendly error for auth/network-request-failed', async () => {
      hoisted.mockSendPasswordResetEmail.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
      await expect(service.resetPassword('doc@test.com')).rejects.toThrow('Network error');
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('calls signOut', async () => {
      hoisted.mockSignOut.mockResolvedValueOnce(undefined);
      await service.logout();
      expect(hoisted.mockSignOut).toHaveBeenCalledOnce();
    });

    it('clears currentUserValue after logout', async () => {
      hoisted.mockSignOut.mockResolvedValueOnce(undefined);
      await service.logout();
      expect(service.currentUserValue).toBeNull();
    });

    it('throws when signOut fails', async () => {
      hoisted.mockSignOut.mockRejectedValueOnce(new Error('signOut failed'));
      await expect(service.logout()).rejects.toThrow('signOut failed');
    });
  });

  // ── handleAuthError — edge cases ──────────────────────────────────────────────
  describe('handleAuthError — unknown error codes', () => {
    it('uses error.message for unknown error codes', async () => {
      hoisted.mockSignIn.mockRejectedValueOnce({ code: 'auth/unknown', message: 'Something weird happened' });
      await expect(service.login('doc@test.com', 'pass')).rejects.toThrow('Something weird happened');
    });

    it('uses fallback message when no code or message', async () => {
      hoisted.mockSignIn.mockRejectedValueOnce({});
      await expect(service.login('doc@test.com', 'pass')).rejects.toThrow('An error occurred during authentication');
    });
  });
});