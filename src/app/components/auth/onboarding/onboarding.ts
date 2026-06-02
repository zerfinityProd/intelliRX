import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClinicService } from '../../../services/clinicService';
import { ClinicContextService } from '../../../services/clinicContextService';
import { FirestoreApiService } from '../../../services/firestore-api.service';
import { AuthenticationService } from '../../../services/authenticationService';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css'
})
export class OnboardingComponent {
  clinic = {
    name: '',
    address: '',
    phone: ''
  };

  isSaving = false;
  errorMessage = '';

  constructor(
    private router: Router,
    private clinicService: ClinicService,
    private clinicContext: ClinicContextService,
    private api: FirestoreApiService,
    private auth: AuthenticationService
  ) {}

  async saveClinic(event: Event) {
    event.preventDefault();
    if (!this.clinic.name || !this.clinic.address) {
      this.errorMessage = 'Name and address are required.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      // 1. Create the clinic
      const clinicId = await this.clinicService.createClinic({
        name: this.clinic.name,
        address: this.clinic.address,
        phone: this.clinic.phone,
        subscription_id: this.clinicContext.requireSubscriptionId(),
        doctor_ids: [],
        schedule: { weekdays: ['M','T','W','Th','F'], timings: [{label: 'Morning', start: '09:00', end: '13:00'}] }
      });

      // 2. Set context
      this.clinicContext.setClinicContext(clinicId, this.clinicContext.requireSubscriptionId());
      
      // 3. Update the owner's clinic_users record to include this clinic_id
      // Fetch the owner's clinic_users doc
      const userId = this.auth.getCurrentUserId();
      if (userId) {
        const cuDocs = await this.api.runQuery('', {
          collectionId: 'clinic_users',
          filters: [
            { field: 'user_id', op: '==', value: userId }
          ]
        });
        if (cuDocs.length > 0) {
          // Just update the first one since they just registered
          await this.api.updateDocument('clinic_users', cuDocs[0].id, {
            clinic_id: clinicId
          });
        }
      }

      // 4. Navigate to admin dashboard
      this.router.navigate(['/admin-dashboard']);
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to create clinic.';
    } finally {
      this.isSaving = false;
    }
  }
}
