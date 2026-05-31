import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
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

    /**
     * 'website' = Owner/SuperAdmin portal (/login)
     * 'app'     = Clinical app portal (/app/login)
     */
    loginMode: 'website' | 'app' = 'website';

    private readonly authService = inject(AuthenticationService);
    private readonly authorizationService = inject(AuthorizationService);
    private readonly firestoreApi = inject(FirestoreApiService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly themeService = inject(ThemeService);
    private readonly clinicContextService = inject(ClinicContextService);
    private readonly notificationService = inject(NotificationService);

    constructor() { }

    async ngOnInit(): Promise<void> {
        // Detect which login portal we are on from route data
        this.loginMode = this.route.snapshot.data['loginMode'] || 'website';

        // If the user navigated to /login explicitly, sign them out so they
        // can pick which account to use.
        if (this.authService.isLoggedIn()) {
            this.authService.logout();
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
        return this.loginMode === 'website'
            ? 'Z-Admin Portal'
            : 'IntelliRX Application';
    }

    get portalSubtitle(): string {
        return this.loginMode === 'website'
            ? 'Z-Admin Access Only'
            : 'Admin, Doctor & Staff Portal';
    }

    /** Navigate based on role, enforcing portal-specific rules */
    private async navigateByRole(email: string): Promise<void> {
        this.promptNotificationPermission(email);

        // Fetch user's role once for routing decisions
        const role = await this.authorizationService.getUserRole(email);
        if (!role) {
            this.errorMessage = 'Could not determine user role. Please try again.';
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
        }

        if (this.loginMode === 'website') {
            // Website login: Only z_admin allowed
            if (role === 'z_admin') {
                this.router.navigate(['/admin']);
                return;
            }
            // Everyone else must use App Login
            this.errorMessage = 'This portal is for Z-Admin only. Please use the App Login.';
            await this.authService.logout();
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
        }

        if (this.loginMode === 'app') {
            // App login: admin, doctors and receptionists allowed
            if (role === 'z_admin') {
                this.errorMessage = 'Z-Admin must use the Z-Admin Login portal.';
                await this.authService.logout();
                this.isLoading = false;
                this.cdr.detectChanges();
                return;
            }

            // Admin (subscription_owner) logging into the app → admin dashboard
            if (role === 'subscription_owner') {
                await this.ensureClinicSelected(email);
                this.router.navigate(['/admin-dashboard']);
                return;
            }

            // Doctor/Receptionist logging into the app
            if (role === 'doctor' || role === 'receptionist') {
                await this.ensureClinicSelected(email);
                this.router.navigate(['/home']);
                return;
            }

            this.errorMessage = 'No valid account found. Please contact your administrator.';
            await this.authService.logout();
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
        }
    }

    /**
     * Two-tier selection: subscription → clinic.
     * Works for both doctors and receptionists.
     */
    private async ensureClinicSelected(userEmail: string): Promise<void> {
        const assignments = await this.authorizationService.getUserAssignments(userEmail);

        console.log('[Login] ensureClinicSelected — total assignments:', assignments.length);
        assignments.forEach((a, i) =>
            console.log(`[Login]   assignment[${i}]: subscriptionId="${a.subscriptionId}"  clinicId="${a.clinicId}"`)
        );

        if (!assignments.length) {
            // No assignments — keep whatever context is stored (or null)
            const subId = await this.authorizationService.getUserSubscriptionId(userEmail);
            this.clinicContextService.setClinicContext(
                this.clinicContextService.getSelectedClinicId(),
                subId
            );
            return;
        }

        // Single assignment — auto-select
        if (assignments.length === 1) {
            this.clinicContextService.setClinicContext(
                assignments[0].clinicId,
                assignments[0].subscriptionId
            );
            return;
        }

        // Multiple assignments — check how many subscriptions
        const subscriptionIds = [...new Set(assignments.map(a => a.subscriptionId))];
        console.log('[Login] unique subscriptionIds:', subscriptionIds);

        let chosenSubId: string;
        if (subscriptionIds.length === 1) {
            // Single subscription, multiple clinics
            console.log('[Login] → single subscription, skipping subscription prompt');
            chosenSubId = subscriptionIds[0];
        } else {
            // Multiple subscriptions — prompt user to pick one
            console.log('[Login] → multiple subscriptions, showing subscription prompt');
            chosenSubId = await this.promptSubscriptionSelection(subscriptionIds);
        }

        // Now find clinics within the chosen subscription
        const clinicsInSub = assignments
            .filter(a => a.subscriptionId === chosenSubId)
            .map(a => a.clinicId);
        console.log('[Login] clinics in chosen subscription:', clinicsInSub);

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
        const options: Record<string, string> = {};
        for (const id of subscriptionIds) options[id] = id;

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
        const options: Record<string, string> = {};
        for (const id of clinicIds) options[id] = id;

        const result = await Swal.fire({
            title: 'Select Clinic',
            text: 'Which clinic do you want to login for?',
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

    /** Navigate to the other login portal */
    goToOtherPortal(): void {
        if (this.loginMode === 'website') {
            this.router.navigate(['/app/login']);
        } else {
            this.router.navigate(['/login']);
        }
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