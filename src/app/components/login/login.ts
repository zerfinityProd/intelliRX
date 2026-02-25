import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authenticationService';
import { ThemeService } from '../../services/themeService';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent implements OnInit {
  // Login mode
  isLoginMode: boolean = true;

  // Form fields
  email: string = '';
  password: string = '';
  displayName: string = '';

  // UI state
  errorMessage: string = '';
  successMessage: string = '';
  isLoading: boolean = false;
  showForgotPassword: boolean = false;

  private readonly authService = inject(AuthenticationService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly themeService = inject(ThemeService);

  constructor() {
    // Redirect if already logged in
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }
  }

  ngOnInit(): void {
    // Theme is initialized globally in AppComponent
    // No need for duplicate localStorage access
  }

  /**
   * Toggle between login and register mode
   */
  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.successMessage = '';
    this.showForgotPassword = false;
  }

  /**
   * Handle email/password login
   */
  async onLogin(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    // Validation
    if (!this.email.trim()) {
      this.errorMessage = 'Please enter your email';
      return;
    }

    if (!this.isValidEmail(this.email)) {
      this.errorMessage = 'Please enter a valid email address';
      return;
    }

    if (!this.password) {
      this.errorMessage = 'Please enter your password';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return;
    }

    this.isLoading = true;

    try {
      await this.authService.login(this.email.trim(), this.password);
      this.router.navigate(['/home']);
    } catch (error: any) {
      this.errorMessage = error.message || 'Login failed. Please try again.';
      this.cdr.detectChanges();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle user registration
   */
  async onRegister(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    // Validation
    if (!this.displayName.trim()) {
      this.errorMessage = 'Please enter your name';
      return;
    }

    if (!this.email.trim()) {
      this.errorMessage = 'Please enter your email';
      return;
    }

    if (!this.isValidEmail(this.email)) {
      this.errorMessage = 'Please enter a valid email address';
      return;
    }

    if (!this.password) {
      this.errorMessage = 'Please enter a password';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return;
    }

    this.isLoading = true;

    try {
      await this.authService.register(this.email.trim(), this.password, this.displayName.trim());
      this.successMessage = 'Account created successfully!';
      this.cdr.detectChanges();

      // Redirect after short delay
      setTimeout(() => {
        this.router.navigate(['/home']);
      }, 1000);
    } catch (error: any) {
      this.errorMessage = error.message || 'Registration failed. Please try again.';
      this.cdr.detectChanges();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle Google login
   */
  async onGoogleLogin(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;

    try {
      await this.authService.loginWithGoogle();
      this.router.navigate(['/home']);
    } catch (error: any) {
      this.errorMessage = error.message || 'Google sign-in failed. Please try again.';
      this.cdr.detectChanges();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Toggle forgot password view
   */
  toggleForgotPassword(): void {
    this.showForgotPassword = !this.showForgotPassword;
    this.errorMessage = '';
    this.successMessage = '';
  }

  /**
   * Handle password reset
   */
  async onResetPassword(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.email.trim()) {
      this.errorMessage = 'Please enter your email';
      return;
    }

    if (!this.isValidEmail(this.email)) {
      this.errorMessage = 'Please enter a valid email address';
      return;
    }

    this.isLoading = true;

    try {
      await this.authService.resetPassword(this.email.trim());
      this.successMessage = 'Password reset email sent! Check your inbox.';
      this.cdr.detectChanges();

      // Reset form after delay
      setTimeout(() => {
        this.showForgotPassword = false;
        this.successMessage = '';
        this.cdr.detectChanges();
      }, 3000);
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to send reset email. Please try again.';
      this.cdr.detectChanges();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}