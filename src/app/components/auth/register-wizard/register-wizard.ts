import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthenticationService } from '../../../services/authenticationService';
import { AdminService } from '../../../services/adminService';
import { SubscriptionRepository } from '../../../repositories/interfaces/subscription.repository';
import { PlanService } from '../../../services/planService';
import { ClinicContextService } from '../../../services/clinicContextService';
import { PlanDetail, BillingCycle } from '../../../models/subscription.model';

@Component({
  selector: 'app-register-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './register-wizard.html',
  styleUrl: './register-wizard.css'
})
export class RegisterWizardComponent implements OnInit {
  selectedPlan = '';
  billingCycle: BillingCycle = 'monthly';

  isProcessing = false;
  isVerifying = false;
  isSuccess = false;
  errorMessage = '';

  plans: PlanDetail[] = [];

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
    private planService: PlanService,
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
      // Use PlanService — same single source of truth as Manage Subscription page.
      // Keep Demo plan (unlike Manage Subscription which filters it out).
      this.plans = await this.planService.getPlans();
    } catch (error) {
      console.error('Failed to load plans:', error);
      // Fallback using PlanDetail shape
      this.plans = [
        {
          key: 'demo', label: 'Demo', monthly_charges: 0, quarterly_charges: 0,
          yearly_charges: 0, max_clinics: 1, max_doctors: 1, max_patients: 5,
          max_receptionists: 1, validity_days: 7
        },
        {
          key: 'starter', label: 'Starter', monthly_charges: 999, quarterly_charges: 749,
          yearly_charges: 499, max_clinics: 1, max_doctors: 1, max_patients: 50,
          max_receptionists: 1, validity_days: 30
        },
        {
          key: 'pro', label: 'Pro', monthly_charges: 1999, quarterly_charges: 1499,
          yearly_charges: 999, max_clinics: 5, max_doctors: 5, max_patients: 50,
          max_receptionists: 5, validity_days: 30
        },
      ];
    } finally {
      // Auto-select the first plan when no plan was pre-selected via query param
      if (!this.selectedPlan && this.plans.length > 0) {
        this.selectedPlan = this.plans[0].key;
      }
      // The Firestore promise resolves outside Angular's zone, so change
      // detection won't fire automatically — manually trigger it.
      this.cdr.detectChanges();
    }
  }

  // ── Billing cycle ──────────────────────────────────────────────────────────

  setBillingCycle(cycle: BillingCycle): void {
    this.billingCycle = cycle;
    this.cdr.detectChanges();
  }

  selectPlan(planKey: string) {
    this.selectedPlan = planKey;
    this.cdr.detectChanges();
  }

  // ── Computed savings badges on cycle buttons ───────────────────────────────

  get maxQuarterlySavings(): number {
    if (!this.plans.length) return 0;
    return Math.max(...this.plans.map(p => this.planService.getSavingsPercent(p, 'quarterly')));
  }

  get maxYearlySavings(): number {
    if (!this.plans.length) return 0;
    return Math.max(...this.plans.map(p => this.planService.getSavingsPercent(p, 'yearly')));
  }

  // ── Price helpers — delegates to PlanService (no duplicated logic) ─────────

  /** Per-month price for the selected billing cycle */
  getPricePerMonth(plan: PlanDetail): number {
    switch (this.billingCycle) {
      case 'quarterly': return plan.quarterly_charges;
      case 'yearly':    return plan.yearly_charges;
      default:          return plan.monthly_charges;
    }
  }

  /** Total billed amount for the selected cycle */
  getTotalCharge(plan: PlanDetail): number {
    return this.planService.getTotalCharge(plan, this.billingCycle);
  }

  /** Savings % vs monthly billing (0 for monthly) */
  getSavings(plan: PlanDetail): number {
    return this.planService.getSavingsPercent(plan, this.billingCycle);
  }

  // ── Form submission ────────────────────────────────────────────────────────

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
      // 2. Create Subscription Document — saves selected plan AND billing cycle
      const subscriptionId = await this.subscriptionRepo.createSubscription({
        entity_name: this.account.clinicName,
        owner_email: this.account.email.trim().toLowerCase(),
        plan: this.selectedPlan,
        billing_cycle: this.billingCycle,
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

      // 5. Success → redirect to owner dashboard
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
