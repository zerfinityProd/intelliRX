import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationExtras } from '@angular/router';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService, ClinicAssignment } from '../../services/authorizationService';
import { ClinicRepository } from '../../repositories/interfaces/clinic.repository';
import { SubscriptionRepository } from '../../repositories/interfaces/subscription.repository';
import { ThemeService } from '../../services/themeService';
import { ClinicContextService } from '../../services/clinicContextService';

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
    isLoading: boolean = false;         // email/password & forgot-password only
    googleLoading: boolean = false;
    microsoftLoading: boolean = false;
    appleLoading: boolean = false;
    showForgotPassword: boolean = false;

    /** True while ANY social-login popup is open */
    get socialLoading(): boolean {
        return this.googleLoading || this.microsoftLoading || this.appleLoading;
    }


    private readonly authService = inject(AuthenticationService);
    private readonly authorizationService = inject(AuthorizationService);
    private readonly clinicRepo = inject(ClinicRepository);
    private readonly subscriptionRepo = inject(SubscriptionRepository);
    private readonly router = inject(Router);

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly themeService = inject(ThemeService);
    private readonly clinicContextService = inject(ClinicContextService);


    constructor() { }

    async ngOnInit(): Promise<void> {
        // Clear any leftover OAuth redirect flags from before the popup migration
        sessionStorage.removeItem('redirectAuthPending');

        // ── Multi-tab redirect (second-tab scenario) ──────────────────────────
        // We use a sessionStorage flag ('irx.appActive') that gets written the
        // first time the app shell (home/dashboard) is loaded in this browser
        // session. If that flag is already present when the user lands on /app/login,
        // it means another tab in the same session is already inside the app —
        // so we auto-redirect this tab too, preserving the session.
        //
        // If the flag is NOT set, the user genuinely navigated to /app/login from
        // outside (fresh load, bookmark, etc.) and the login form should always show,
        // even if Firebase still holds an auth token from a previous session.
        //
        // Only redirect when email is verified — an unverified registration must
        // not bypass the login form.
        const isMultiTab = sessionStorage.getItem('irx.appActive') === '1';

        if (isMultiTab && this.authService.isLoggedIn() && this.authService.isEmailVerified()) {
            const email = this.authService.currentUserValue?.email;
            if (email) {
                await this.navigateByRole(email);
                return;
            }
        }
    }

    /** Get the portal title for UI display */
    get portalTitle(): string {
        return 'Welcome Back';
    }

    get portalSubtitle(): string {
        return 'Admin, Doctor & Staff Portal';
    }

    /** Navigate based on role after successful login */
    private async navigateByRole(email: string): Promise<void> {

        // ── Gate: only allow emails that exist in the users collection ──
        const allowed = await this.authorizationService.isEmailAllowed(email);
        if (!allowed) {
            this.errorMessage = 'Access denied. Your email is not registered in the system. Please contact your administrator.';
            await this.authService.logout();
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
        }


        // Fetch all global roles for routing decisions
        const globalRoles = await this.authorizationService.getUserGlobalRoles(email);
        const role = await this.authorizationService.getUserRole(email);

        if (!role) {
            this.errorMessage = 'Could not determine user role. Please try again.';
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
        }

        // Z-Admin → super admin dashboard (bypasses subscription expiry check)
        if (role === 'z_admin') {
            this.router.navigate(['/admin']);
            return;
        }

        // ── Gate: subscription expiry check (blocks all non-z_admin users) ──
        const expiryStatus = await this.authorizationService.checkSubscriptionExpiry(email);

        if (expiryStatus === 'expired') {
            // Admins / subscription owners can manage their own subscription —
            // keep them logged in and send them straight to the Manage Subscription page.
            const isAdmin = globalRoles.includes('admin') || role === 'subscription_owner';

            if (isAdmin) {
                // Persist subscriptionId so the subscription management page can load without extra queries
                try {
                    const subId = await this.authorizationService.getUserSubscriptionId(email);
                    if (subId) {
                        this.clinicContextService.setClinicContext(null, subId);
                    }
                } catch { /* non-critical */ }

                this.isLoading = false;
                this.cdr.detectChanges();
                this.router.navigate(['/admin/subscription']);
                return;
            }

            // Non-admin staff (doctors, receptionists) — log out and show the expired page.
            await this.authService.logout();
            this.isLoading = false;
            this.cdr.detectChanges();
            this.router.navigate(['/subscription-expired']);
            return;
        }

        // Admin routing — depends on whether they also have clinical roles
        const isAdmin = globalRoles.includes('admin');
        const hasClinicalRole = globalRoles.includes('doctor') || globalRoles.includes('receptionist');

        if (isAdmin && hasClinicalRole) {
            // Admin + Doctor/Receptionist → clinical home (they can access admin dashboard from navbar)
            this.router.navigate(['/home']);
            await this.ensureClinicSelected(email);
            return;
        }

        if (isAdmin && !hasClinicalRole) {
            // Admin-only → admin dashboard (no access to clinical home).
            // Resolve and persist the subscriptionId into ClinicContextService
            // so the admin dashboard can load it without extra Firestore queries.
            try {
                const subId = await this.authorizationService.getUserSubscriptionId(email);

                if (subId) {
                    this.clinicContextService.setClinicContext(null, subId);
                }
            } catch { /* non-critical — dashboard has its own fallbacks */ }
            this.router.navigate(['/admin-dashboard']);
            return;
        }

        // Subscription owner without 'admin' in global_roles (legacy)
        if (role === 'subscription_owner') {
            this.router.navigate(['/home']);
            await this.ensureClinicSelected(email);
            return;
        }

        // Doctor/Receptionist → clinical home
        if (role === 'doctor' || role === 'receptionist') {
            this.router.navigate(['/home']);
            await this.ensureClinicSelected(email);
            return;
        }

        this.errorMessage = 'No valid account found. Please contact your administrator.';
        await this.authService.logout();
        this.isLoading = false;
        this.cdr.detectChanges();
    }

    /**
     * Two-tier selection: subscription → clinic.
     * Works for both doctors and receptionists.
     *
     * Single assignments are auto-selected. When there are multiple options,
     * the user is navigated to the full-page /app/select-clinic route instead
     * of a popup.
     */
    private async ensureClinicSelected(userEmail: string): Promise<void> {
        const assignments = await this.authorizationService.getUserAssignments(userEmail);

        if (!assignments.length) {
            // No assignments — resolve subscriptionId from Firestore
            const subId = await this.authorizationService.getUserSubscriptionId(userEmail);
            this.clinicContextService.setClinicContext(
                this.clinicContextService.getSelectedClinicId(),
                subId
            );
            return;
        }

        // Single assignment — auto-select without prompting
        if (assignments.length === 1) {
            this.clinicContextService.setClinicContext(
                assignments[0].clinicId,
                assignments[0].subscriptionId
            );
            return;
        }

        // Multiple assignments — check how many subscriptions
        const subscriptionIds = [...new Set(assignments.map(a => a.subscriptionId))];

        if (subscriptionIds.length === 1) {
            // Single subscription, multiple clinics — jump straight to clinic picker
            const chosenSubId = subscriptionIds[0];
            const clinicsInSub = assignments
                .filter(a => a.subscriptionId === chosenSubId)
                .map(a => a.clinicId);

            if (clinicsInSub.length === 1) {
                // Only one clinic — auto-select
                this.clinicContextService.setClinicContext(clinicsInSub[0], chosenSubId);
                return;
            }

            // Navigate to full-page clinic picker
            const extras: NavigationExtras = {
                state: {
                    mode: 'clinic',
                    ids: clinicsInSub,
                    subscriptionId: chosenSubId,
                    returnUrl: '/home'
                }
            };
            this.router.navigate(['/app/select-clinic'], extras);
            return;
        }

        // Multiple subscriptions — navigate to full-page subscription picker.
        // Pass allAssignments so the selector can resolve clinics after sub is picked.
        const extras: NavigationExtras = {
            state: {
                mode: 'subscription',
                ids: subscriptionIds,
                allAssignments: assignments,
                returnUrl: '/home'
            }
        };
        this.router.navigate(['/app/select-clinic'], extras);
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
        this.googleLoading = true;
        this.cdr.detectChanges();

        // Reset spinner immediately when the popup window is closed
        // (window regains focus). Don't wait for Firebase's 2-4 s delay.
        let resolved = false;
        const focusHandler = () => {
            setTimeout(() => {
                if (!resolved && this.googleLoading) {
                    this.googleLoading = false;
                    this.cdr.detectChanges();
                }
            }, 300);
        };
        window.addEventListener('focus', focusHandler, { once: true });

        try {
            const user = await this.authService.loginWithGoogle();
            resolved = true;
            window.removeEventListener('focus', focusHandler);
            if (user) {
                await this.navigateByRole(user.email);
            }
        } catch (error: any) {
            resolved = true;
            window.removeEventListener('focus', focusHandler);
            if (error?.code !== 'popup-cancelled') {
                this.errorMessage = error.message || 'Google login failed.';
            }
        } finally {
            this.googleLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onMicrosoftLogin(): Promise<void> {
        this.errorMessage = '';
        this.microsoftLoading = true;
        this.cdr.detectChanges();

        let resolved = false;
        const focusHandler = () => {
            setTimeout(() => {
                if (!resolved && this.microsoftLoading) {
                    this.microsoftLoading = false;
                    this.cdr.detectChanges();
                }
            }, 300);
        };
        window.addEventListener('focus', focusHandler, { once: true });

        try {
            const user = await this.authService.loginWithMicrosoft();
            resolved = true;
            window.removeEventListener('focus', focusHandler);
            if (user) {
                await this.navigateByRole(user.email);
            }
        } catch (error: any) {
            resolved = true;
            window.removeEventListener('focus', focusHandler);
            if (error?.code !== 'popup-cancelled') {
                this.errorMessage = error.message || 'Microsoft login failed.';
            }
        } finally {
            this.microsoftLoading = false;
            this.cdr.detectChanges();
        }
    }

    async onAppleLogin(): Promise<void> {
        this.errorMessage = '';
        this.appleLoading = true;
        this.cdr.detectChanges();

        let resolved = false;
        const focusHandler = () => {
            setTimeout(() => {
                if (!resolved && this.appleLoading) {
                    this.appleLoading = false;
                    this.cdr.detectChanges();
                }
            }, 300);
        };
        window.addEventListener('focus', focusHandler, { once: true });

        try {
            const user = await this.authService.loginWithApple();
            resolved = true;
            window.removeEventListener('focus', focusHandler);
            if (user) {
                await this.navigateByRole(user.email);
            }
        } catch (error: any) {
            resolved = true;
            window.removeEventListener('focus', focusHandler);
            if (error?.code !== 'popup-cancelled') {
                this.errorMessage = error.message || 'Apple login failed.';
            }
        } finally {
            this.appleLoading = false;
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
        this.cdr.detectChanges();
        try {
            // Gate: only send reset links to emails registered in IntelliRx
            const allowed = await this.authorizationService.isEmailAllowed(this.email.trim());
            if (!allowed) {
                this.errorMessage = 'This email is not registered in IntelliRx. Please contact your administrator.';
                return;
            }

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



    /** Navigate back to the IntelliRx home/landing page */
    goToHome(): void {
        this.router.navigate(['/']);
    }


    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}