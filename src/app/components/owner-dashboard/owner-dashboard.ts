import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authenticationService';
import { ClinicService } from '../../services/clinicService';
import { ClinicContextService } from '../../services/clinicContextService';
import { AdminService } from '../../services/adminService';
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
    private adminService: AdminService
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
    const sub = await this.adminService.getSubscription(subId);
    if (sub) {
      this.subscription = sub as any;
      this.selectedPlan = (this.subscription as any).plan || 'Pro';
    }

    const staffMap = new Map();
    for (const clinic of this.clinics) {
      const cuEntries = await this.adminService.getClinicUsersForClinic(clinic.id);

      for (const cu of cuEntries) {
        const data = cu as any;
        if (data['status'] === 'deleted') continue;
        
        const userId = cu.user_id;
        if (!userId) continue;

        // Fetch user doc to get role and name
        let userName = 'Staff User';
        let userRole = 'doctor';
        let isOwner = false;
        try {
          const user = await this.adminService.getUserById(userId);
          if (user) {
            userName = (user as any).name || 'Staff User';
            const globalRoles: string[] = (user as any).global_roles || [];
            isOwner = globalRoles.includes('subscription_owner');
            if (globalRoles.includes('receptionist') || globalRoles.includes('recep')) {
              userRole = 'receptionist';
            } else if (globalRoles.includes('doctor')) {
              userRole = 'doctor';
            } else if (globalRoles.length > 0) {
              userRole = globalRoles[0];
            }
          }
        } catch {
          // Use defaults if user doc fetch fails
        }

        if (isOwner) continue; // Skip owners

        if (!staffMap.has(userId)) {
          staffMap.set(userId, { 
            id: userId, 
            clinicUserId: cu.id || (data as any)['id'],
            name: userName, 
            role: userRole, 
          clinics: [data['clinic_id']],
            status: data['status'] || 'active',
            availability: data['availability'] || {}
          });
        } else {
          staffMap.get(userId).clinics.push(data['clinic_id']);
        }
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
      const normalizedEmail = this.inviteForm.email.toLowerCase().trim();
      const newRole = this.inviteForm.role;

      // Check if a user with this email already exists
      const existingUser = await this.adminService.getUserByEmail(normalizedEmail);

      if (existingUser) {
        const existingName = (existingUser as any).name || normalizedEmail;
        alert(`A staff member with email "${normalizedEmail}" already exists (${existingName}). Please use the Edit button to update their roles or assignments.`);
        this.isInviting = false;
        return;
      }

      // No existing user — create a new user doc
      await this.adminService.createUser({
        email: normalizedEmail,
        name: this.inviteForm.name,
        global_roles: [newRole],
        status: 'active',
      } as any);

      // Create clinic_users doc for the new user's clinic assignment
      const createdUser = await this.adminService.getUserByEmail(normalizedEmail);
      if (createdUser) {
        await this.adminService.createClinicUser({
          user_id: createdUser.id!,
          clinic_id: this.inviteForm.clinicId,
          role: newRole as any,
          status: 'active' as any,
        });
      }

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
      await this.adminService.updateClinicUser(staff.clinicUserId, { status: 'deleted' as any });
      await this.loadData();
    } catch (e) {
      alert('Failed to delete staff member');
    }
  }

  async deleteClinic(clinic: any) {
    if (!confirm('Are you sure you want to delete this clinic?')) return;
    try {
      // Soft delete clinic by updating status flag
      await this.adminService.deleteClinic(clinic.id);
      await this.loadData();
    } catch (e) {
      alert('Failed to delete clinic');
    }
  }

  async changePlan() {
    if (!this.subscription?.id || !this.selectedPlan) return;
    this.isChangingPlan = true;
    try {
      await this.adminService.updateSubscription(this.subscription.id, { plan: this.selectedPlan } as any);
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
    this.router.navigate(['/app/login']);
  }
}
