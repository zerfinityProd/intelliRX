import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthenticationService } from '../../../services/authenticationService';
import { FirestoreApiService } from '../../../services/firestore-api.service';

@Component({
  selector: 'app-register-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register-wizard.html',
  styleUrl: './register-wizard.css'
})
export class RegisterWizardComponent implements OnInit {
  currentStep = 1;
  selectedPlan = 'basic';
  isProcessing = false;
  errorMessage = '';

  account = {
    name: '',
    email: '',
    password: '',
    clinicName: ''
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthenticationService,
    private api: FirestoreApiService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['plan']) {
        this.selectedPlan = params['plan'];
      }
    });
  }

  nextStep(event: Event) {
    event.preventDefault();
    this.errorMessage = '';
    
    // Validation
    if (!this.account.name || !this.account.email || !this.account.password || !this.account.clinicName) {
      this.errorMessage = 'Please fill out all fields.';
      return;
    }
    
    if (this.account.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters.';
      return;
    }

    this.currentStep = 2;
  }

  async processPayment(event: Event) {
    event.preventDefault();
    this.isProcessing = true;
    this.errorMessage = '';

    try {
      // 1. Mock payment delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 2. Generate new Subscription ID
      const subscriptionId = this.api.generateDocId();

      // 3. Create Subscription Document
      await this.api.setDocument('subscriptions', subscriptionId, {
        name: this.account.clinicName,
        plan: this.selectedPlan,
        status: 'active',
        created_at: new Date().toISOString()
      });

      // 4. Create User Document (Allows Firebase Auth to succeed)
      // Since we don't have the UID yet, we'll create the user doc by a generated ID
      // but AuthenticationService uses email matching for auth lookup, so this works.
      const userDocId = this.api.generateDocId();
      await this.api.setDocument('users', userDocId, {
        name: this.account.name,
        email: this.account.email.trim().toLowerCase(),
        global_roles: ['subscription_owner'],
        status: 'active',
        created_at: new Date().toISOString()
      });

      // 5. Create clinic_users entry for this owner to attach them to the subscription
      const cuId = this.api.generateDocId();
      await this.api.setDocument('clinic_users', cuId, {
        user_id: userDocId,
        status: 'active'
      });

      // 6. Finally, register the user with Firebase Auth
      await this.authService.register(this.account.email, this.account.password, this.account.name);

      // 7. Success
      this.currentStep = 3;
      setTimeout(() => {
        this.router.navigate(['/onboarding']);
      }, 2000);

    } catch (error: any) {
      this.errorMessage = error.message || 'An error occurred during setup.';
    } finally {
      this.isProcessing = false;
    }
  }
}
