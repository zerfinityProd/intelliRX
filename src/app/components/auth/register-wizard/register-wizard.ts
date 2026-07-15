import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthenticationService } from '../../../services/authenticationService';
import { AdminService } from '../../../services/adminService';
import { SubscriptionRepository } from '../../../repositories/interfaces/subscription.repository';
import { PlanRepository } from '../../../repositories/interfaces/plan.repository';
import { ClinicContextService } from '../../../services/clinicContextService';

@Component({
  selector: 'app-register-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register-wizard.html',
  styleUrl: './register-wizard.css'
})
export class RegisterWizardComponent implements OnInit {
  selectedPlan = '';
  isProcessing = false;
  isVerifying = false;
  isSuccess = false;
  errorMessage = '';

  plans: any[] = [];

  account = {
    name: '',
    email: '',
    clinicName: ''
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthenticationService,
    private adminService: AdminService,
    private subscriptionRepo: SubscriptionRepository,
    private planRepo: PlanRepository,
    private clinicContext: ClinicContextService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['plan']) {
        this.selectedPlan = params['plan'];
      }
    });

    this.loadPlans();
  }

  async loadPlans() {
    try {
      this.plans = await this.planRepo.listPlans() as any[];
    } catch (error) {
      console.error('Failed to load plans:', error);
      // Fallback uses PlanDetail shape (key, label, max_* flat fields)
      this.plans = [
        { key: 'demo',    label: 'Demo',    max_clinics: 1, max_doctors: 1,  max_patients: 5,   max_receptionists: 1 },
        { key: 'starter', label: 'Starter', max_clinics: 1, max_doctors: 3,  max_patients: 50,  max_receptionists: 2 },
        { key: 'pro',     label: 'Pro',     max_clinics: 3, max_doctors: 10, max_patients: 500, max_receptionists: 5 },
      ];
    } finally {
      // Auto-select the first plan when no plan was pre-selected via query param
      if (!this.selectedPlan && this.plans.length > 0) {
        this.selectedPlan = this.plans[0].key;
      }
      // The Firestore promise resolves outside Angular's zone, so change
      // detection won't fire automatically — manually trigger it so the
      // plan cards appear without requiring any user interaction.
      this.cdr.detectChanges();
    }
  }

  selectPlan(planId: string) {
    this.selectedPlan = planId;
    // Same zone issue as loadPlans — manually trigger so the selected
    // state (radio dot, border highlight) is reflected immediately.
    this.cdr.detectChanges();
  }

  async completeSetup(event: Event) {
    event.preventDefault();
    this.errorMessage = '';

    if (!this.account.name || !this.account.email || !this.account.clinicName) {
      this.errorMessage = 'Please fill out all fields.';
      return;
    }

    if (!this.selectedPlan) {
      this.errorMessage = 'Please select a plan.';
      return;
    }

    this.isProcessing = true;

    try {
      // 1. Register with Firebase Auth FIRST so we get an auth token
      //    for subsequent Firestore REST API calls.
      const tempPassword = this.generateTempPassword();
      try {
        await this.authService.register(this.account.email, tempPassword, this.account.name);
      } catch (authErr: any) {
        // If email was already registered (e.g. from a previous failed attempt),
        // the Firebase Auth user exists but Firestore docs might be missing.
        if (authErr.message?.includes('already registered') ||
          authErr.message?.includes('email-already-in-use')) {
          console.log('[Register] Email already in auth — sending password reset email');
          // Send a password reset email so the user can set a known password
          try {
            await this.authService.resetPassword(this.account.email.trim());
          } catch (resetErr) {
            console.warn('[Register] Password reset email failed:', resetErr);
          }
          throw new Error(
            'An account with this email already exists but setup was not completed. ' +
            'We have sent a password reset email. Please check your inbox, ' +
            'reset your password, and then log in from the Login page.'
          );
        } else {
          throw authErr;
        }
      }

      // Small delay to let Firebase Auth state propagate and token become available
      await new Promise(resolve => setTimeout(resolve, 800));

      // Send verification email and pause here
      await this.authService.sendVerificationEmail();

      this.ngZone.run(() => {
        this.isVerifying = true;
        this.isProcessing = false;
        this.cdr.detectChanges();
      });

    } catch (error: any) {
      this.authService.setRegistering(false);
      console.error('[Register] Setup failed:', error);
      // Use NgZone.run to ensure Angular picks up the state changes,
      // because Firebase promise rejections can resolve outside the zone.
      this.ngZone.run(() => {
        this.errorMessage = error.message || 'An error occurred during setup.';
        this.isProcessing = false;
        this.cdr.detectChanges();
      });
    }
  }

  async checkVerification() {
    this.errorMessage = '';
    this.isProcessing = true;
    try {
      const isVerified = await this.authService.reloadCurrentUser();
      if (!isVerified) {
        this.ngZone.run(() => {
          this.errorMessage = 'Email not verified yet. Please check your inbox and click the verification link.';
          this.isProcessing = false;
          this.cdr.detectChanges();
        });
        return;
      }

      await this.finalizeSetup();
    } catch (error: any) {
      console.error('[Verify] Verification check failed:', error);
      this.ngZone.run(() => {
        this.errorMessage = error.message || 'An error occurred while checking verification.';
        this.isProcessing = false;
        this.cdr.detectChanges();
      });
    }
  }

  private async finalizeSetup() {
    try {
      // 2. Create Subscription Document (ID is auto-generated by the repository)
      const subscriptionId = await this.subscriptionRepo.createSubscription({
        entity_name: this.account.clinicName,
        owner_email: this.account.email.trim().toLowerCase(),
        plan: this.selectedPlan,
        status: 'active',
      } as any);

      // 3. Create User Document
      await this.adminService.createUser({
        name: this.account.name,
        email: this.account.email.trim().toLowerCase(),
        global_roles: ['admin'],
        subscription_id: subscriptionId,
        status: 'active',
      } as any);

      // 4. Set subscription context
      this.clinicContext.setClinicContext(null, subscriptionId);

      this.authService.setRegistering(false);

      // 7. Success → redirect to owner dashboard
      this.ngZone.run(() => {
        this.isSuccess = true;
        this.isVerifying = false;
        this.isProcessing = false;
        this.cdr.detectChanges();
      });
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 2000);

    } catch (error: any) {
      this.authService.setRegistering(false);
      console.error('[Finalize] Setup failed:', error);
      this.ngZone.run(() => {
        this.errorMessage = error.message || 'An error occurred during final setup.';
        this.isProcessing = false;
        this.cdr.detectChanges();
      });
    }
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
