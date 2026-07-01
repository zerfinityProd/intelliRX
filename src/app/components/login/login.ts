import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { FirestoreApiService } from '../../services/firestore-api.service';
import { ThemeService } from '../../services/themeService';
import { NotificationService } from '../../services/notificationService';
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
    isLoading: boolean = false;
    showForgotPassword: boolean = false;

    private readonly authService = inject(AuthenticationService);
    private readonly authorizationService = inject(AuthorizationService);
    private readonly firestoreApi = inject(FirestoreApiService);
    private readonly router = inject(Router);

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly themeService = inject(ThemeService);
    private readonly clinicContextService = inject(ClinicContextService);
    private readonly notificationService = inject(NotificationService);

    constructor() { }

    async ngOnInit(): Promise<void> {
        // If the user navigated to /app/login explicitly, sign them out so they
        // can pick which account to use.
        if (this.authService.isLoggedIn()) {
            await this.authService.logout();
        }

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

        this.promptNotificationPermission(email);

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
            // Admin-only → admin dashboard (no access to clinical home)
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

        let chosenSubId: string;
        if (subscriptionIds.length === 1) {
            // Single subscription, multiple clinics — skip subscription prompt
            chosenSubId = subscriptionIds[0];
        } else {
            // Multiple subscriptions — prompt user to pick one
            chosenSubId = await this.promptSubscriptionSelection(subscriptionIds);
        }

        // Find clinics within the chosen subscription
        const clinicsInSub = assignments
            .filter(a => a.subscriptionId === chosenSubId)
            .map(a => a.clinicId);

        let chosenClinicId: string;
        if (clinicsInSub.length === 1) {
            chosenClinicId = clinicsInSub[0];
        } else {
            // Multiple clinics — prompt user to pick one
            chosenClinicId = await this.promptClinicSelection(clinicsInSub);
        }

        this.clinicContextService.setClinicContext(chosenClinicId, chosenSubId);
    }

    private async promptSubscriptionSelection(subscriptionIds: string[]): Promise<string> {
        const { default: Swal } = await import('sweetalert2');
        // Fetch subscription names for display
        const options: Record<string, string> = {};
        for (const id of subscriptionIds) {
            try {
                const doc = await this.firestoreApi.getDocument('subscriptions', id);
                const name = doc?.data?.['entity_name'] || doc?.data?.['name'] || id;
                options[id] = name;
            } catch {
                options[id] = id;
            }
        }

        const result = await Swal.fire({
            title: 'Select Organisation',
            text: 'You belong to multiple organisations. Which one do you want to use?',
            input: 'select',
            inputOptions: options,
            inputPlaceholder: 'Select an organisation',
            showCancelButton: false,
            confirmButtonText: 'Continue',
            allowOutsideClick: false,
            confirmButtonColor: '#148D9E'
        });

        return String(result.value ?? subscriptionIds[0]);
    }

    private async promptClinicSelection(clinicIds: string[]): Promise<string> {
        const { default: Swal } = await import('sweetalert2');
        // Fetch clinic names for display
        const options: Record<string, string> = {};
        for (const id of clinicIds) {
            try {
                const doc = await this.firestoreApi.getDocument('clinics', id);
                const name = doc?.data?.['name'] || id;
                const address = doc?.data?.['address'];
                options[id] = address ? `${name} — ${address}` : name;
            } catch {
                options[id] = id;
            }
        }

        const result = await Swal.fire({
            title: 'Select Clinic',
            input: 'select',
            inputOptions: options,
            inputPlaceholder: 'Select a clinic',
            showCancelButton: false,
            confirmButtonText: 'Continue',
            allowOutsideClick: false,
            confirmButtonColor: '#148D9E'
        });

        return String(result.value ?? clinicIds[0]);
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
            const user = await this.authService.loginWithGoogle();
            if (user) {
                await this.navigateByRole(user.email);
            }
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



    /** Navigate back to the IntelliRx home/landing page */
    goToHome(): void {
        this.router.navigate(['/']);
    }

    /**
     * Fire-and-forget: look up the user's Firestore doc ID and ask the
     * NotificationService to show the browser prompt if they haven't
     * already responded.
     */
    private promptNotificationPermission(email: string): void {
        this.authorizationService.getUserId(email).then(userId => {
            if (userId) {
                this.notificationService.promptIfNeeded(userId);
            }
        }).catch(err => console.warn('Notification prompt skipped:', err));
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}