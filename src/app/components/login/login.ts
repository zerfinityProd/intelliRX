import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { ThemeService } from '../../services/themeService';
import { filter, take } from 'rxjs';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './login.html',
    styleUrl: './login.css'
})
export class LoginComponent implements OnInit {
    isLoginMode: boolean = true;
    email: string = '';
    password: string = '';
    displayName: string = '';
    errorMessage: string = '';
    successMessage: string = '';
    isLoading: boolean = false;
    showForgotPassword: boolean = false;

    private readonly authService = inject(AuthenticationService);
    private readonly authorizationService = inject(AuthorizationService);
    private readonly router = inject(Router);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly themeService = inject(ThemeService);

    constructor() {}

    async ngOnInit(): Promise<void> {
        try {
            const user = await this.authService.handleGoogleRedirectResult();
            if (user) {
                await this.navigateByRole(user.email);
                return;
            }
        } catch (error: any) {
            if (error.message && !error.message.includes('popup was closed')) {
                this.errorMessage = error.message;
                this.cdr.detectChanges();
                return;
            }
        }

        this.authService.authReady$.pipe(
            filter(ready => ready),
            take(1)
        ).subscribe(() => {
            if (this.authService.isLoggedIn()) {
                this.authService.logout();
            }
        });
    }

    /** Navigate to home or reception-home based on Firestore role */
    private async navigateByRole(email: string): Promise<void> {
        await this.themeService.loadThemeFromFirebase();
        const role = await this.authorizationService.getUserRole(email);
        if (role === 'receptionist') {
            this.router.navigate(['/reception-home']);
        } else {
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

        if (!this.email.trim()) { this.errorMessage = 'Please enter your email'; return; }
        if (!this.isValidEmail(this.email)) { this.errorMessage = 'Please enter a valid email address'; return; }
        if (!this.password) { this.errorMessage = 'Please enter your password'; return; }
        if (this.password.length < 6) { this.errorMessage = 'Password must be at least 6 characters'; return; }

        this.isLoading = true;
        try {
            const user = await this.authService.login(this.email.trim(), this.password);
            await this.navigateByRole(user.email);
        } catch (error: any) {
            this.errorMessage = error.message || 'Login failed. Please try again.';
            this.cdr.detectChanges();
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onRegister(): Promise<void> {
        this.errorMessage = '';
        this.successMessage = '';

        if (!this.displayName.trim()) { this.errorMessage = 'Please enter your name'; return; }
        if (!this.email.trim()) { this.errorMessage = 'Please enter your email'; return; }
        if (!this.isValidEmail(this.email)) { this.errorMessage = 'Please enter a valid email address'; return; }
        if (!this.password) { this.errorMessage = 'Please enter a password'; return; }
        if (this.password.length < 6) { this.errorMessage = 'Password must be at least 6 characters'; return; }

        this.isLoading = true;
        try {
            const user = await this.authService.register(
                this.email.trim(), this.password, this.displayName.trim()
            );
            this.successMessage = 'Account created successfully!';
            this.cdr.detectChanges();
            setTimeout(() => this.navigateByRole(user.email), 1000);
        } catch (error: any) {
            this.errorMessage = error.message || 'Registration failed. Please try again.';
            this.cdr.detectChanges();
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onGoogleLogin(): Promise<void> {
        this.errorMessage = '';
        this.isLoading = true;
        this.cdr.detectChanges();
        try {
            // loginWithGoogle() internally navigates; we override with role-based nav
            await this.authService.loginWithGoogle();
            const email = this.authService.currentUserValue?.email || '';
            if (email) await this.navigateByRole(email);
        } catch (error: any) {
            this.errorMessage = error.message || 'Google login failed.';
            this.cdr.detectChanges();
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onMicrosoftLogin(): Promise<void> {
        this.errorMessage = '';
        this.isLoading = true;
        this.cdr.detectChanges();
        try {
            await this.authService.loginWithMicrosoft();
            const email = this.authService.currentUserValue?.email || '';
            if (email) await this.navigateByRole(email);
        } catch (error: any) {
            this.errorMessage = error.message || 'Microsoft login failed.';
            this.cdr.detectChanges();
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onAppleLogin(): Promise<void> {
        this.errorMessage = '';
        this.isLoading = true;
        this.cdr.detectChanges();
        try {
            await this.authService.loginWithApple();
            const email = this.authService.currentUserValue?.email || '';
            if (email) await this.navigateByRole(email);
        } catch (error: any) {
            this.errorMessage = error.message || 'Apple login failed.';
            this.cdr.detectChanges();
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    toggleForgotPassword(): void {
        this.showForgotPassword = !this.showForgotPassword;
        this.errorMessage = '';
        this.successMessage = '';
    }

    async onResetPassword(): Promise<void> {
        this.errorMessage = '';
        this.successMessage = '';

        if (!this.email.trim()) { this.errorMessage = 'Please enter your email'; return; }
        if (!this.isValidEmail(this.email)) { this.errorMessage = 'Please enter a valid email address'; return; }

        this.isLoading = true;
        try {
            await this.authService.resetPassword(this.email.trim());
            this.successMessage = 'Password reset email sent! Check your inbox.';
            this.cdr.detectChanges();
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

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}