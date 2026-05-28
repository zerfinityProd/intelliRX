import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authenticationService';
import { ClinicService } from '../../services/clinicService';
import { ClinicContextService } from '../../services/clinicContextService';
import { FirestoreApiService } from '../../services/firestore-api.service';
import { ClinicConfigModalComponent } from './clinic-config-modal/clinic-config-modal';
import { StaffConfigModalComponent } from './staff-config-modal/staff-config-modal';

@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ClinicConfigModalComponent, StaffConfigModalComponent],
  templateUrl: './owner-dashboard.html',
  styleUrl: './owner-dashboard.css'
})
export class OwnerDashboardComponent implements OnInit {
  activeTab = 'clinics';
  showInviteModal = false;
  isInviting = false;

  clinics: any[] = [];
  staff: any[] = [];

  inviteForm = {
    email: '',
    name: '',
    role: 'doctor',
    clinicId: ''
  };

  showClinicConfigModal = false;
  selectedClinicForConfig: any = null;

  showStaffConfigModal = false;
  selectedStaffForConfig: any = null;

  subscription: any = null;
  showPlanModal = false;
  isChangingPlan = false;
  selectedPlan = '';

  constructor(
    private router: Router,
    private auth: AuthenticationService,
    private clinicService: ClinicService,
    private clinicContext: ClinicContextService,
    private api: FirestoreApiService
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const allClinics = await this.clinicService.getClinics();
    this.clinics = allClinics.filter(c => c.status !== 'deleted');
    if (this.clinics.length > 0) {
      this.inviteForm.clinicId = this.clinics[0].id;
    }
    
    // Fetch subscription details
    const subId = this.clinicContext.requireSubscriptionId();
    const subDoc = await this.api.getDocument('subscriptions', subId);
    if (subDoc) {
      this.subscription = { id: subDoc.id, ...subDoc.data };
      this.selectedPlan = this.subscription.plan || 'Pro';
    }

    const cuDocs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'subscription_id', op: '==', value: subId }]
    });

    const staffMap = new Map();
    for (const doc of cuDocs) {
      const data = doc.data;
      if (data['roles'] && data['roles'].includes('subscription_owner')) continue; // Skip owners
      if (data['status'] === 'deleted') continue; // Skip deleted staff
      
      const userId = data['user_id'];
      if (!staffMap.has(userId)) {
        // Mocking user details for now (since we don't do a full join)
        staffMap.set(userId, { 
          id: userId, 
          clinicUserId: doc.id,
          name: `Staff User`, 
          role: data['roles'][0], 
          clinics: [data['clinic_id']],
          status: data['status'] || 'active',
          availability: data['availability'] || {}
        });
      } else {
        staffMap.get(userId).clinics.push(data['clinic_id']);
      }
    }
    this.staff = Array.from(staffMap.values());
  }

  openClinic(clinicId: string) {
    this.clinicContext.setClinicContext(clinicId, this.clinicContext.requireSubscriptionId());
    this.router.navigate(['/home']);
  }

  async inviteStaff(event: Event) {
    event.preventDefault();
    this.isInviting = true;
    try {
      // Create user doc
      const userId = this.api.generateDocId();
      await this.api.setDocument('users', userId, {
        email: this.inviteForm.email.toLowerCase().trim(),
        name: this.inviteForm.name,
        global_roles: [this.inviteForm.role],
        status: 'active'
      });

      // Create clinic_users doc
      const cuId = this.api.generateDocId();
      await this.api.setDocument('clinic_users', cuId, {
        user_id: userId,
        subscription_id: this.clinicContext.requireSubscriptionId(),
        clinic_id: this.inviteForm.clinicId,
        roles: [this.inviteForm.role],
        status: 'active'
      });

      this.showInviteModal = false;
      this.inviteForm = { email: '', name: '', role: 'doctor', clinicId: this.clinics[0]?.id || '' };
      await this.loadData();
    } catch (e) {
      console.error(e);
    } finally {
      this.isInviting = false;
    }
  }

  editClinic(clinic: any) {
    this.selectedClinicForConfig = clinic;
    this.showClinicConfigModal = true;
  }

  onClinicConfigSaved() {
    this.showClinicConfigModal = false;
    this.loadData();
  }

  editStaff(staff: any) {
    this.selectedStaffForConfig = staff;
    this.showStaffConfigModal = true;
  }

  onStaffConfigSaved() {
    this.showStaffConfigModal = false;
    this.loadData();
  }

  async deleteStaff(staff: any) {
    if (!confirm('Are you sure you want to deactivate this staff member?')) return;
    try {
      await this.api.updateDocument('clinic_users', staff.clinicUserId, { status: 'deleted' });
      await this.loadData();
    } catch (e) {
      alert('Failed to delete staff member');
    }
  }

  async deleteClinic(clinic: any) {
    if (!confirm('Are you sure you want to delete this clinic?')) return;
    try {
      // Soft delete clinic by updating status flag
      await this.api.updateDocument('clinics', clinic.id, { status: 'deleted' });
      await this.loadData();
    } catch (e) {
      alert('Failed to delete clinic');
    }
  }

  async changePlan() {
    if (!this.subscription?.id || !this.selectedPlan) return;
    this.isChangingPlan = true;
    try {
      await this.api.updateDocument('subscriptions', this.subscription.id, {
        plan: this.selectedPlan,
        updated_at: new Date().toISOString()
      });
      this.showPlanModal = false;
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to change plan.');
    } finally {
      this.isChangingPlan = false;
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
