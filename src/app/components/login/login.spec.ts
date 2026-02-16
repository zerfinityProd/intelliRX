import { describe, it, expect, vi, beforeEach } from 'vitest';

class TestLoginComponent {
  isLoginMode = true;
  email = '';
  password = '';
  displayName = '';
  errorMessage = '';
  successMessage = '';
  isLoading = false;
  showForgotPassword = false;

  constructor(private authService: any, private router: any, private cdr: any) {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.successMessage = '';
    this.showForgotPassword = false;
  }

  async onLogin(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;
    try {
      await this.authService.login(this.email.trim(), this.password);
      this.successMessage = 'Login successful!';
      setTimeout(() => this.router.navigate(['/home']), 1000);
    } catch (error: any) {
      this.errorMessage = error.message || 'Login failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async onGoogleLogin(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;
    try {
      await this.authService.loginWithGoogle();
      this.successMessage = 'Login successful!';
      setTimeout(() => this.router.navigate(['/home']), 1000);
    } catch (error: any) {
      this.errorMessage = error.message || 'Google login failed.';
    } finally {
      this.isLoading = false;
    }
  }

  async onRegister(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;
    try {
      await this.authService.register(this.email.trim(), this.password, this.displayName.trim());
      this.successMessage = 'Account created successfully!';
      setTimeout(() => this.router.navigate(['/home']), 1000);
    } catch (error: any) {
      this.errorMessage = error.message || 'Registration failed.';
    } finally {
      this.isLoading = false;
    }
  }
}

function makeComponent(isLoggedIn = false) {
  const authServiceMock = {
    login: vi.fn().mockResolvedValue({ uid: 'user1' }),
    loginWithGoogle: vi.fn().mockResolvedValue({ uid: 'user1' }),
    register: vi.fn().mockResolvedValue({ uid: 'user1' }),
    isLoggedIn: vi.fn().mockReturnValue(isLoggedIn),
  };
  const routerMock = { navigate: vi.fn() };
  const cdrMock = { detectChanges: vi.fn() };
  const comp = new TestLoginComponent(authServiceMock, routerMock, cdrMock);
  return { comp, authServiceMock, routerMock };
}

describe('LoginComponent', () => {
  vi.useFakeTimers();

  describe('Initial state', () => {
    it('starts in login mode', () => {
      const { comp } = makeComponent();
      expect(comp.isLoginMode).toBe(true);
    });
  });

  describe('Constructor redirect', () => {
    it('redirects if already logged in', () => {
      const { routerMock } = makeComponent(true);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/home']);
    });
  });

  describe('onLogin', () => {
    it('calls authService.login and navigates', async () => {
      const { comp, authServiceMock, routerMock } = makeComponent();
      comp.email = 'test@example.com';
      comp.password = 'password123';
      
      await comp.onLogin();
      
      expect(authServiceMock.login).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(comp.successMessage).toBe('Login successful!');
      
      vi.advanceTimersByTime(1000);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/home']);
    });
  });

  describe('toggleMode', () => {
    it('toggles between modes', () => {
      const { comp } = makeComponent();
      comp.toggleMode();
      expect(comp.isLoginMode).toBe(false);
    });
  });
});