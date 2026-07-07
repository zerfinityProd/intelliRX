import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthenticationService } from '../../../services/authenticationService';
import { FirestoreApiService, DocumentResult } from '../../../services/firestore-api.service';
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
  isSuccess = false;
  errorMessage = '';

  plans: DocumentResult[] = [];

  account = {
    name: '',
    email: '',
    clinicName: ''
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthenticationService,
    private api: FirestoreApiService,
    private clinicContext: ClinicContextService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

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
      this.plans = await this.api.listDocuments('plans');
    } catch (error) {
      console.error('Failed to load plans:', error);
      this.plans = [
        { id: 'demo', data: { max_clinics: 1, max_doctors: 1, max_patients: 5, max_receptionist: 1 }, path: 'plans/demo' },
        { id: 'starter', data: { max_clinics: 1, max_doctors: 3, max_patients: 50, max_receptionist: 2 }, path: 'plans/starter' },
        { id: 'pro', data: { max_clinics: 3, max_doctors: 10, max_patients: 500, max_receptionist: 5 }, path: 'plans/pro' }
      ];
    } finally {
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

      // 2. Generate sequential subscription ID (sub_1, sub_2, ...)
      const subscriptionId = await this.api.getNextSequentialId('sub');
      const userDocId = await this.api.getNextSequentialId('usr');

      // 3. Create Subscription Document
      await this.api.setDocument('subscriptions', subscriptionId, {
        entity_name: this.account.clinicName,
        owner_email: this.account.email.trim().toLowerCase(),
        plan: this.selectedPlan,
        status: 'active',
        created_at: new Date().toISOString()
      });

      // 4. Create User Document
      await this.api.setDocument('users', userDocId, {
        name: this.account.name,
        email: this.account.email.trim().toLowerCase(),
        global_roles: ['admin'],
        subscription_id: subscriptionId,
        status: 'active',
        created_at: new Date().toISOString()
      });

      // 5. Set subscription context
      this.clinicContext.setClinicContext(null, subscriptionId);

      // 7. Success → redirect to owner dashboard
      this.ngZone.run(() => {
        this.isSuccess = true;
        this.isProcessing = false;
        this.cdr.detectChanges();
      });
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 2000);

    } catch (error: any) {
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

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
