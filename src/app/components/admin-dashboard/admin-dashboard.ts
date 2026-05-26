// src/app/components/admin-dashboard/admin-dashboard.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthenticationService } from '../../services/authenticationService';
import { AdminService } from '../../services/adminService';
import { FirestoreApiService } from '../../services/firestore-api.service';
import { NavbarComponent } from '../navbar/navbar';
import { Subscription } from '../../models/subscription.model';
import { ClinicUserAvailability } from '../../models/clinic-user.model';

// ── Shared interfaces ──────────────────────────────────────────────────────────

export interface TimingBlock { label: string; start: string; end: string; }

export interface AdminClinicState {
  id: string; name: string; address: string; phone: string; email: string;
  subscription_id: string; weekdays: string[]; timings: TimingBlock[];
  created_at?: string; updated_at?: string;
}

export interface UserClinicAssignment {
  clinicUserId?: string; clinicId: string; clinicName: string;
  role: 'doctor' | 'receptionist'; availability: ClinicUserAvailability;
}

export interface AdminUserState {
  userId?: string; email: string; name: string; specialization?: string;
  global_roles: string[]; status: 'active' | 'inactive';
  assignments: UserClinicAssignment[]; created_at?: string; updated_at?: string;
}

export interface PermissionSet {
  canAddPatient: boolean; canEdit: boolean; canDelete: boolean;
  canAddVisit: boolean; canEditVisit: boolean; canAppointment: boolean; canCancel: boolean;
}

interface DashboardStats {
  clinics: number; users: number; doctors: number; receptionists: number;
  doctorPermissions: number; receptionistPermissions: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboardComponent implements OnInit {
  private authService = inject(AuthenticationService);
  private adminService = inject(AdminService);
  private api = inject(FirestoreApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // ── Dashboard state ────────────────────────────────────────────────────────
  isLoading = true;
  errorMessage = '';
  subscription: (Subscription & { id: string }) | null = null;
  /** Subscription ID pre-assigned in the user's Firestore doc (e.g. "sub_03"). */
  assignedSubscriptionId = '';
  adminName = '';
  adminEmail = '';
  private userDocId = '';

  stats: DashboardStats = {
    clinics: 0, users: 0, doctors: 0, receptionists: 0,
    doctorPermissions: 0, receptionistPermissions: 0,
  };

  // ── Confirmation dialog ────────────────────────────────────────────────────
  confirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  private confirmResolve: ((v: boolean) => void) | null = null;

  showConfirm(title: string, message: string): Promise<boolean> {
    this.confirmTitle = title; this.confirmMessage = message;
    this.confirmVisible = true; this.cdr.detectChanges();
    return new Promise(resolve => { this.confirmResolve = resolve; });
  }
  onConfirmYes() { this.confirmVisible = false; this.confirmResolve?.(true); this.confirmResolve = null; }
  onConfirmNo()  { this.confirmVisible = false; this.confirmResolve?.(false); this.confirmResolve = null; }

  // ── Wizard state ───────────────────────────────────────────────────────────
  showWizard = false;
  wizardStep = 1;
  wizardIsLoading = false;
  wizardIsFetching = false;
  wizardError = '';
  wizardSuccess = '';

  readonly wizardSteps = [
    { num: 1, label: 'Subscription', icon: '🏢' },
    { num: 2, label: 'Clinics',      icon: '🏥' },
    { num: 3, label: 'Permissions',  icon: '🔑' },
    { num: 4, label: 'Users',        icon: '👥' },
    { num: 5, label: 'Done',         icon: '✅' },
  ];

  // Step 1 – Subscription
  wizardSubscriptions: (Subscription & { id: string })[] = [];
  wizardSelectedSub: (Subscription & { id: string }) | null = null;
  isCreatingSubscription = false;
  /** True when the pre-assigned subscription doc already exists in Firestore but has
   *  incomplete data — controls whether we UPDATE or CREATE when the form is saved. */
  private _assignedSubDocExists = false;
  newSub = {
    entity_name: '', owner_email: '', billing_email: '',
    plan_name: 'basic' as 'basic' | 'premium', max_clinics: 5,
    max_doctors: 10, max_appointments_per_day: 50,
    status: 'active' as 'active' | 'inactive' | 'suspended',
  };

  // Step 2 – Clinics
  wizardClinics: AdminClinicState[] = [];
  wizardShowClinicForm = false;
  wizardEditingClinic: AdminClinicState | null = null;
  wizardClinicForm: AdminClinicState = this.emptyClinicForm();

  readonly allWeekdays = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
  readonly weekdayLabels: Record<string, string> = {
    M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', Sa: 'Sat', Su: 'Sun',
  };

  // Step 3 – Permissions
  readonly permissionDefs: { key: keyof PermissionSet; label: string; desc: string }[] = [
    { key: 'canAddPatient', label: 'Add Patient',       desc: 'Register new patient records' },
    { key: 'canEdit',       label: 'Edit Patient',      desc: 'Modify patient information' },
    { key: 'canDelete',     label: 'Delete Records',    desc: 'Delete patients / visits' },
    { key: 'canAddVisit',   label: 'Add Visit',         desc: 'Create prescriptions & visit notes' },
    { key: 'canEditVisit',  label: 'Edit Visit',        desc: 'Modify existing visit records' },
    { key: 'canAppointment',label: 'Book Appointment',  desc: 'Schedule appointments' },
    { key: 'canCancel',     label: 'Cancel Appointment',desc: 'Cancel existing appointments' },
  ];

  doctorPermissions: PermissionSet = {
    canAddPatient: true, canEdit: true, canDelete: false,
    canAddVisit: true, canEditVisit: true, canAppointment: true, canCancel: true,
  };
  receptionistPermissions: PermissionSet = {
    canAddPatient: true, canEdit: false, canDelete: false,
    canAddVisit: false, canEditVisit: false, canAppointment: true, canCancel: true,
  };

  // Step 4 – Users
  wizardUsers: AdminUserState[] = [];
  wizardShowUserForm = false;
  wizardEditingUser: AdminUserState | null = null;
  wizardUserForm: AdminUserState = this.emptyUserForm();
  wizardConflictErrors: string[] = [];

  // ── Getters ────────────────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }
  get subscriptionPlanLabel(): string { return (this.subscription?.plan?.name || 'basic').toUpperCase(); }
  get subscriptionStatusClass(): string { return this.subscription?.status === 'active' ? 'status-active' : 'status-inactive'; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await firstValueFrom(this.authService.authReady$.pipe(filter(r => r)));
    const currentUser = this.authService.currentUserValue;
    this.adminName = currentUser?.name || 'Admin';
    this.adminEmail = currentUser?.email || '';

    await this.findUserDoc();
    await this.loadWizardSubscriptions();

    // Open wizard automatically if subscription is missing or has incomplete data
    // (entity_name empty = subscription document exists but was never properly filled)
    const hasValidSub = !!(this.subscription?.entity_name?.trim() && this.subscription?.plan);
    if (!hasValidSub) {
      this.showWizard = true;
      this.wizardStep = 1;
      // If an existing subscription_id was found but data is incomplete, pre-select it
      if (this.subscription && !this.wizardSelectedSub) {
        const match = this.wizardSubscriptions.find(s => s.id === this.subscription!.id);
        if (match) this.wizardSelectedSub = match;
      }
    } else {
      await this.loadDashboardData();
    }

    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private async findUserDoc(): Promise<void> {
    try {
      const email = this.adminEmail.toLowerCase().trim();
      const userDocs = await this.api.runQuery('', {
        collectionId: 'users', filters: [{ field: 'email', op: '==', value: email }],
      });
      if (!userDocs.length) return;
      const userDoc = userDocs[0];
      this.userDocId = userDoc.id;
      const subscriptionId: string = userDoc.data['subscription_id'] || '';
      this.assignedSubscriptionId = subscriptionId; // remember the pre-assigned ID
      if (subscriptionId) {
        const subDoc = await this.api.getDocument('subscriptions', subscriptionId);
        if (subDoc) this.subscription = { ...(subDoc.data as Subscription), id: subDoc.id };
      }
    } catch (e: any) { this.errorMessage = 'Failed to load user profile: ' + (e?.message || ''); }
  }

  async loadDashboardData(): Promise<void> {
    if (!this.subscription) return;
    try {
      const id = this.subscription.id;
      const [clinics, allCU, doctorPerms, receptPerms] = await Promise.all([
        this.adminService.getClinicsForSubscription(id),
        this.adminService.getClinicUsers(id),
        this.adminService.getRolePermissions('doctor'),
        this.adminService.getRolePermissions('receptionist'),
      ]);
      const uniqueUsers = new Set(allCU.map(cu => cu.user_id).filter(Boolean));
      this.stats = {
        clinics: clinics.length, users: uniqueUsers.size,
        doctors: allCU.filter(cu => (cu.roles || []).includes('doctor')).length,
        receptionists: allCU.filter(cu => (cu.roles || []).includes('receptionist')).length,
        doctorPermissions: doctorPerms.length, receptionistPermissions: receptPerms.length,
      };
    } catch (e: any) { this.errorMessage = 'Failed to load dashboard: ' + (e?.message || ''); }
  }

  // ── Dashboard navigation ───────────────────────────────────────────────────
  navigateToSetup(step: number): void { this.router.navigate(['/admin-setup'], { queryParams: { step } }); }
  navigateToHome(): void { this.router.navigate(['/home']); }

  openWizard(): void {
    this.wizardStep = 1;
    this.wizardError = ''; this.wizardSuccess = '';
    this.wizardSelectedSub = this.subscription;
    this.wizardShowClinicForm = false;
    this.wizardShowUserForm = false;
    this.isCreatingSubscription = false;
    this._assignedSubDocExists = false;
    this.showWizard = true;
    this.cdr.detectChanges();
  }

  async closeWizard(): Promise<void> {
    this.showWizard = false;
    this.wizardShowClinicForm = false;
    this.wizardShowUserForm = false;
    this.isCreatingSubscription = false;
    // Sync the selected subscription back to the dashboard
    if (this.wizardSelectedSub) {
      this.subscription = this.wizardSelectedSub;
      await this.loadDashboardData();
    }
    this.cdr.detectChanges();
  }

  // ── Wizard step navigation ─────────────────────────────────────────────────
  getWizardStepStatus(n: number): 'completed' | 'current' | 'upcoming' {
    if (n < this.wizardStep) return 'completed';
    if (n === this.wizardStep) return 'current';
    return 'upcoming';
  }

  async wizardNext(): Promise<void> {
    this.wizardError = '';
    this.wizardSuccess = '';

    if (this.wizardStep === 1) {
      if (!this.wizardSelectedSub) { this.wizardError = 'Please select or create a subscription first.'; return; }
      this.wizardIsLoading = true;
      try {
        await this.saveSubscriptionToUserDoc(this.wizardSelectedSub.id);
        this.subscription = this.wizardSelectedSub;
        await this.loadWizardClinics();
        await this.loadWizardPermissions();
      } catch (e: any) { this.wizardError = e.message; this.wizardIsLoading = false; return; }
      this.wizardIsLoading = false;
    }

    if (this.wizardStep === 3) {
      this.wizardIsLoading = true;
      try {
        await this.saveWizardPermissions();
        await this.loadWizardUsers();
        this.wizardSuccess = '✓ Permissions saved!';
      } catch (e: any) { this.wizardError = e.message; this.wizardIsLoading = false; return; }
      this.wizardIsLoading = false;
    }

    if (this.wizardStep === 4) {
      // Finish setup → reload dashboard stats
      this.wizardIsLoading = true;
      await this.loadDashboardData();
      this.wizardIsLoading = false;
      this.wizardStep = 5;
      this.cdr.detectChanges();
      return;
    }

    if (this.wizardStep === 5) {
      await this.closeWizard();
      return;
    }

    this.wizardStep++;
    this.cdr.detectChanges();
  }

  wizardBack(): void {
    if (this.wizardStep > 1) {
      this.wizardStep--;
      this.wizardShowClinicForm = false;
      this.wizardShowUserForm = false;
      this.wizardError = '';
      this.cdr.detectChanges();
    }
  }

  // ── Step 1: Subscriptions ──────────────────────────────────────────────────
  async loadWizardSubscriptions(): Promise<void> {
    this.wizardIsFetching = true;
    try {
      const allSubs = await this.adminService.getSubscriptions();

      if (this.assignedSubscriptionId) {
        // ── Admin already has a subscription_id in their user doc ──────────────
        // Only ever show/use that specific subscription; creation of new ones
        // is blocked entirely.
        const found = allSubs.find(s => s.id === this.assignedSubscriptionId);
        if (found) {
          // Check whether the cached doc has all required fields
          const isComplete = !!(found.entity_name?.trim() && found.plan?.name && found.plan?.limits);
          if (isComplete) {
            this.wizardSubscriptions = [found];
            this.wizardSelectedSub = found;
          } else {
            // Subscription document exists but has incomplete data —
            // prompt the admin to fill in the missing details.
            this.wizardSubscriptions = [];
            this._assignedSubDocExists = true;
            this.isCreatingSubscription = true;
            this._prefillNewSubFromIncomplete(found);
          }
        } else {
          // The doc with this ID doesn't exist in Firestore yet — try a direct
          // fetch (in case getSubscriptions() uses a filtered query).
          try {
            const subDoc = await this.api.getDocument('subscriptions', this.assignedSubscriptionId);
            if (subDoc) {
              const sub = { ...(subDoc.data as Subscription), id: subDoc.id };
              const isComplete = !!(sub.entity_name?.trim() && sub.plan?.name && sub.plan?.limits);
              if (isComplete) {
                this.wizardSubscriptions = [sub];
                this.wizardSelectedSub = sub;
              } else {
                // Document exists but has incomplete data — prompt admin to fill in details
                this.wizardSubscriptions = [];
                this._assignedSubDocExists = true;
                this.isCreatingSubscription = true;
                this._prefillNewSubFromIncomplete(sub);
              }
            } else {
              // Document truly doesn't exist yet — open the create form so the
              // admin fills in details; the ID will be locked to assignedSubscriptionId.
              this.wizardSubscriptions = [];
              this._assignedSubDocExists = false;
              this.isCreatingSubscription = true;
              this.newSub = {
                entity_name: '', owner_email: this.adminEmail, billing_email: '',
                plan_name: 'basic', max_clinics: 5, max_doctors: 10,
                max_appointments_per_day: 50, status: 'active',
              };
            }
          } catch {
            this.wizardSubscriptions = [];
            this._assignedSubDocExists = false;
            this.isCreatingSubscription = true;
          }
        }
      } else {
        // ── No subscription_id assigned yet — email-filtered behaviour ──────────
        // Only show subscriptions whose owner_email or billing_email matches
        // the signed-in admin's email.  An empty email means the profile hasn't
        // loaded yet — return nothing rather than dumping every subscription.
        const email = this.adminEmail.toLowerCase().trim();
        this.wizardSubscriptions = email
          ? allSubs.filter(s => {
              const om = (s.owner_email ?? '').toLowerCase().trim() === email;
              const bm = (s.billing_email ?? '').toLowerCase().trim() === email;
              return om || bm;
            })
          : []; // Do NOT fall back to all subscriptions — that leaks tenants

        if (this.wizardSubscriptions.length === 1 && !this.wizardSelectedSub) {
          this.wizardSelectedSub = this.wizardSubscriptions[0];
        }
        if (this.subscription && !this.wizardSelectedSub) {
          const match = this.wizardSubscriptions.find(s => s.id === this.subscription!.id);
          if (match) this.wizardSelectedSub = match;
        }
      }
    } catch (e: any) { this.wizardError = 'Failed to load subscriptions: ' + e.message; }
    finally { this.wizardIsFetching = false; }
  }

  selectWizardSub(sub: Subscription & { id: string }): void {
    this.wizardSelectedSub = sub;
    this.isCreatingSubscription = false;
    this.wizardError = '';
    this.cdr.detectChanges();
  }

  startNewSubscription(): void {
    // Block if a subscription ID is already assigned in the user doc.
    if (this.assignedSubscriptionId) {
      this.wizardError = 'A subscription is already assigned to your account. You cannot create a new one.';
      return;
    }
    this.wizardSelectedSub = null;
    this.isCreatingSubscription = true;
    this._assignedSubDocExists = false;
    this.newSub = {
      entity_name: '', owner_email: this.adminEmail, billing_email: '',
      plan_name: 'basic', max_clinics: 5, max_doctors: 10,
      max_appointments_per_day: 50, status: 'active',
    };
  }

  async createSubscription(): Promise<void> {
    if (!this.newSub.entity_name.trim() || !this.newSub.owner_email.trim()) {
      this.wizardError = 'Entity name and owner email are required.'; return;
    }
    this.wizardIsLoading = true;
    try {
      // Use the pre-assigned ID if one exists; otherwise compute the next ID.
      const id = this.assignedSubscriptionId
        || this.adminService.computeNextSubscriptionId(this.wizardSubscriptions.map(s => s.id));
      const subData = {
        entity_name: this.newSub.entity_name.trim(),
        owner_email: this.newSub.owner_email.trim().toLowerCase(),
        billing_email: this.newSub.billing_email.trim().toLowerCase() || this.newSub.owner_email.trim().toLowerCase(),
        plan: {
          name: this.newSub.plan_name,
          limits: {
            max_clinics: this.newSub.max_clinics,
            max_doctors: this.newSub.max_doctors,
            max_appointments_per_day: this.newSub.max_appointments_per_day,
          },
        },
        status: this.newSub.status,
      };
      // If the assigned subscription document already exists in Firestore (but was incomplete),
      // UPDATE it to preserve created_at; otherwise create it fresh.
      if (this.assignedSubscriptionId && this._assignedSubDocExists) {
        await this.adminService.updateSubscription(id, subData);
      } else {
        await this.adminService.createSubscription(subData, id);
      }
      this._assignedSubDocExists = false;
      const now = new Date().toISOString();
      const created = { ...subData, id, created_at: now, updated_at: now } as Subscription & { id: string };
      this.wizardSubscriptions.push(created);
      this.selectWizardSub(created);
      this.isCreatingSubscription = false;
      this.wizardSuccess = '✓ Subscription saved successfully!';
    } catch (e: any) { this.wizardError = 'Failed to create subscription: ' + e.message; }
    finally { this.wizardIsLoading = false; this.cdr.detectChanges(); }
  }

  async deleteWizardSubscription(sub: Subscription & { id: string }): Promise<void> {
    const ok = await this.showConfirm('Delete Subscription', `Delete "${sub.entity_name}"? This cannot be undone.`);
    if (!ok) return;
    this.wizardIsLoading = true;
    try {
      await this.adminService.deleteSubscription(sub.id);
      if (this.wizardSelectedSub?.id === sub.id) this.wizardSelectedSub = null;
      this.wizardSubscriptions = this.wizardSubscriptions.filter(s => s.id !== sub.id);
      this.wizardSuccess = '✓ Subscription deleted.';
    } catch (e: any) { this.wizardError = 'Failed to delete: ' + e.message; }
    finally { this.wizardIsLoading = false; this.cdr.detectChanges(); }
  }

  subInitial(sub: Subscription & { id: string }): string { return sub.entity_name?.trim()?.[0]?.toUpperCase() || '?'; }
  subHasData(sub: Subscription & { id: string }): boolean { return !!sub.entity_name?.trim(); }

  private async saveSubscriptionToUserDoc(subscriptionId: string): Promise<void> {
    if (!this.userDocId) return;
    await this.api.updateDocument('users', this.userDocId, { subscription_id: subscriptionId });
  }

  // ── Step 2: Clinics ────────────────────────────────────────────────────────
  async loadWizardClinics(): Promise<void> {
    if (!this.wizardSelectedSub) return;
    this.wizardIsFetching = true;
    try {
      const raw = await this.adminService.getClinicsForSubscription(this.wizardSelectedSub.id);
      this.wizardClinics = await Promise.all(raw.map(async c => {
        let schedule = (c as any).schedule;
        if (!schedule?.timings?.length) {
          const loaded = await this.adminService.getClinicSchedule(c.id!);
          if (loaded) schedule = loaded;
        }
        return {
          id: c.id!, name: c.name, address: c.address || '',
          phone: c.phone || '', email: c.email || '',
          subscription_id: c.subscription_id,
          weekdays: schedule?.weekdays || [], timings: schedule?.timings || [],
        } as AdminClinicState;
      }));
    } catch (e: any) { this.wizardError = 'Failed to load clinics: ' + e.message; }
    finally { this.wizardIsFetching = false; }
  }

  openNewClinicForm(): void {
    this.wizardClinicForm = this.emptyClinicForm();
    this.wizardEditingClinic = null;
    this.wizardShowClinicForm = true;
    this.wizardError = '';
    this.cdr.detectChanges();
  }

  editWizardClinic(clinic: AdminClinicState): void {
    this.wizardClinicForm = { ...clinic, weekdays: [...clinic.weekdays], timings: clinic.timings.map(t => ({ ...t })) };
    this.wizardEditingClinic = clinic;
    this.wizardShowClinicForm = true;
    this.cdr.detectChanges();
  }

  cancelClinicForm(): void {
    this.wizardShowClinicForm = false;
    this.wizardEditingClinic = null;
    this.cdr.detectChanges();
  }

  async saveWizardClinic(): Promise<void> {
    if (!this.wizardClinicForm.name.trim()) { this.wizardError = 'Clinic name is required.'; return; }
    if (this.wizardClinicForm.timings.some(t => !t.label.trim() || !t.start || !t.end)) {
      this.wizardError = 'All timing blocks need a label, start, and end time.'; return;
    }
    this.wizardIsLoading = true;
    try {
      const schedule = { weekdays: [...this.wizardClinicForm.weekdays], timings: this.wizardClinicForm.timings.map(t => ({ ...t })) };
      const clinicData = {
        name: this.wizardClinicForm.name.trim(), address: this.wizardClinicForm.address.trim(),
        phone: this.wizardClinicForm.phone.trim(), email: this.wizardClinicForm.email.trim().toLowerCase(), schedule,
      };
      const now = new Date().toISOString();
      if (this.wizardEditingClinic) {
        await this.adminService.updateClinic(this.wizardEditingClinic.id, clinicData);
        const idx = this.wizardClinics.findIndex(c => c.id === this.wizardEditingClinic!.id);
        if (idx >= 0) this.wizardClinics[idx] = { ...this.wizardClinics[idx], ...clinicData, weekdays: schedule.weekdays, timings: schedule.timings, updated_at: now };
      } else {
        const newId = this.adminService.computeNextClinicId(this.wizardClinics.map(c => c.id));
        await this.adminService.createClinic({ ...clinicData, subscription_id: this.wizardSelectedSub!.id, doctor_ids: [] }, newId);
        this.wizardClinics.push({ id: newId, ...clinicData, subscription_id: this.wizardSelectedSub!.id, weekdays: schedule.weekdays, timings: schedule.timings, created_at: now, updated_at: now });
      }
      this.wizardShowClinicForm = false;
      this.wizardEditingClinic = null;
      this.wizardSuccess = '✓ Clinic saved!';
    } catch (e: any) { this.wizardError = 'Failed to save clinic: ' + e.message; }
    finally { this.wizardIsLoading = false; this.cdr.detectChanges(); }
  }

  async deleteWizardClinic(clinic: AdminClinicState): Promise<void> {
    const ok = await this.showConfirm('Delete Clinic', `Delete "${clinic.name}"?`);
    if (!ok) return;
    this.wizardIsLoading = true;
    try {
      const cuList = await this.adminService.getClinicUsersForClinic(clinic.id);
      for (const cu of cuList) await this.adminService.deleteClinicUser(cu.id!);
      await this.adminService.deleteClinic(clinic.id);
      this.wizardClinics = this.wizardClinics.filter(c => c.id !== clinic.id);
      this.wizardSuccess = '✓ Clinic deleted.';
    } catch (e: any) { this.wizardError = 'Failed to delete clinic: ' + e.message; }
    finally { this.wizardIsLoading = false; this.cdr.detectChanges(); }
  }

  toggleWizardWeekday(day: string): void {
    const idx = this.wizardClinicForm.weekdays.indexOf(day);
    if (idx >= 0) this.wizardClinicForm.weekdays.splice(idx, 1);
    else this.wizardClinicForm.weekdays.push(day);
  }
  isWizardDaySelected(day: string): boolean { return this.wizardClinicForm.weekdays.includes(day); }

  addWizardTimingBlock(): void {
    const count = this.wizardClinicForm.timings.length;
    const lastEnd = count > 0 ? this.wizardClinicForm.timings[count - 1].end : '09:00';
    const label = count === 0 ? 'FH' : count === 1 ? 'SH' : `Block ${count + 1}`;
    this.wizardClinicForm.timings.push({ label, start: lastEnd, end: '18:00' });
  }
  removeWizardTimingBlock(i: number): void { if (this.wizardClinicForm.timings.length > 1) this.wizardClinicForm.timings.splice(i, 1); }

  getClinicScheduleSummary(clinic: AdminClinicState): string {
    if (!clinic.weekdays.length) return 'No schedule set';
    return clinic.weekdays.map(d => this.weekdayLabels[d] || d).join(', ') + ' | ' + clinic.timings.map(t => `${t.label} ${t.start}–${t.end}`).join(', ');
  }

  // ── Step 3: Permissions ────────────────────────────────────────────────────
  async loadWizardPermissions(): Promise<void> {
    this.wizardIsFetching = true;
    try {
      const dp = await this.adminService.getRolePermissions('doctor');
      const rp = await this.adminService.getRolePermissions('receptionist');
      this.permissionDefs.forEach(p => {
        (this.doctorPermissions as any)[p.key] = dp.includes(p.key);
        (this.receptionistPermissions as any)[p.key] = rp.includes(p.key);
      });
    } catch (e: any) { this.wizardError = 'Failed to load permissions: ' + e.message; }
    finally { this.wizardIsFetching = false; }
  }

  async saveWizardPermissions(): Promise<void> {
    const dp = this.permissionDefs.filter(p => this.doctorPermissions[p.key]).map(p => p.key as string);
    const rp = this.permissionDefs.filter(p => this.receptionistPermissions[p.key]).map(p => p.key as string);
    await this.adminService.setRolePermissions('doctor', dp);
    await this.adminService.setRolePermissions('receptionist', rp);
  }

  countActivePerms(perms: PermissionSet): number { return Object.values(perms).filter(Boolean).length; }

  // ── Step 4: Users ──────────────────────────────────────────────────────────
  async loadWizardUsers(): Promise<void> {
    if (!this.wizardSelectedSub) return;
    this.wizardIsFetching = true;
    try {
      const allCU = await this.adminService.getClinicUsers(this.wizardSelectedSub.id);
      const userIds = [...new Set(allCU.map(cu => cu.user_id).filter(Boolean))];
      this.wizardUsers = [];
      for (const userId of userIds) {
        const userDoc = await this.adminService.getUserById(userId);
        if (!userDoc) continue;
        const assignments: UserClinicAssignment[] = allCU.filter(cu => cu.user_id === userId).map(cu => {
          const clinic = this.wizardClinics.find(c => c.id === cu.clinic_id);
          return { clinicUserId: cu.id, clinicId: cu.clinic_id, clinicName: clinic?.name || cu.clinic_id,
            role: ((cu.roles || ['receptionist'])[0]) as 'doctor' | 'receptionist', availability: (cu as any).availability || {} };
        });
        this.wizardUsers.push({ userId, email: userDoc.email, name: userDoc.name, specialization: userDoc.specialization || '',
          global_roles: userDoc.global_roles || [], status: userDoc.status || 'active', assignments });
      }
    } catch (e: any) { this.wizardError = 'Failed to load users: ' + e.message; }
    finally { this.wizardIsFetching = false; }
  }

  openNewUserForm(): void {
    this.wizardUserForm = this.emptyUserForm();
    this.wizardEditingUser = null;
    this.wizardConflictErrors = [];
    this.wizardShowUserForm = true;
    this.wizardError = '';
    // Auto-add one mandatory clinic assignment if clinics are available
    if (this.wizardClinics.length) {
      const c = this.wizardClinics[0];
      this.wizardUserForm.assignments.push({
        clinicId: c.id,
        clinicName: c.name,
        role: 'receptionist',
        availability: {},
      });
    }
    this.cdr.detectChanges();
  }

  editWizardUser(user: AdminUserState): void {
    this.wizardUserForm = { ...user, global_roles: [...user.global_roles],
      assignments: user.assignments.map(a => ({ ...a, availability: this.deepCopyAvail(a.availability) })) };
    this.wizardEditingUser = user;
    this.wizardConflictErrors = [];
    this.wizardShowUserForm = true;
    this.cdr.detectChanges();
  }

  cancelUserForm(): void {
    this.wizardShowUserForm = false;
    this.wizardEditingUser = null;
    this.wizardConflictErrors = [];
    this.cdr.detectChanges();
  }

  addClinicAssignment(): void {
    if (!this.wizardClinics.length) { this.wizardError = 'No clinics available — add clinics first.'; return; }
    const c = this.wizardClinics[0];
    this.wizardUserForm.assignments.push({ clinicId: c.id, clinicName: c.name, role: 'receptionist', availability: {} });
    this.cdr.detectChanges();
  }

  removeClinicAssignment(i: number): void {
    this.wizardUserForm.assignments.splice(i, 1);
    this.cdr.detectChanges();
  }

  onAssignmentClinicChange(a: UserClinicAssignment, clinicId: string): void {
    const clinic = this.wizardClinics.find(c => c.id === clinicId);
    a.clinicId = clinicId; a.clinicName = clinic?.name || clinicId; a.availability = {};
  }

  onAssignmentRoleChange(a: UserClinicAssignment): void { if (a.role !== 'doctor') a.availability = {}; }

  getClinicForAssignment(clinicId: string): AdminClinicState | undefined { return this.wizardClinics.find(c => c.id === clinicId); }

  toggleAvailability(a: UserClinicAssignment, day: string, block: string): void {
    if (!a.availability[day]) a.availability[day] = [];
    const idx = a.availability[day].indexOf(block);
    if (idx >= 0) a.availability[day].splice(idx, 1); else a.availability[day].push(block);
  }
  isBlockSelected(a: UserClinicAssignment, day: string, block: string): boolean { return (a.availability[day] || []).includes(block); }

  toggleWizardGlobalRole(role: string): void {
    const idx = this.wizardUserForm.global_roles.indexOf(role);
    if (idx >= 0) this.wizardUserForm.global_roles.splice(idx, 1); else this.wizardUserForm.global_roles.push(role);
  }
  hasWizardGlobalRole(role: string): boolean { return this.wizardUserForm.global_roles.includes(role); }

  async saveWizardUser(): Promise<void> {
    if (!this.wizardUserForm.email.trim() || !this.wizardUserForm.name.trim()) {
      this.wizardError = 'Email and name are required.'; return;
    }
    this.wizardIsLoading = true;
    try {
      let userId = this.wizardUserForm.userId;
      const userPayload: any = {
        email: this.wizardUserForm.email.trim().toLowerCase(),
        name: this.wizardUserForm.name.trim(),
        specialization: this.wizardUserForm.specialization?.trim() || '',
        global_roles: this.wizardUserForm.global_roles,
        status: this.wizardUserForm.status,
        subscription_id: this.wizardSelectedSub!.id,
      };
      if (userId) {
        await this.adminService.updateUser(userId, userPayload);
      } else {
        const existing = await this.adminService.getUserByEmail(
          userPayload.email,
          this.wizardSelectedSub!.id   // scope lookup to this subscription only
        );
        if (existing) { userId = existing.id!; await this.adminService.updateUser(userId, userPayload); }
        else { userId = await this.adminService.createUser(userPayload); }
      }

      // Sync clinic assignments
      const existingCUs = await this.adminService.getClinicUsers(this.wizardSelectedSub!.id);
      const userCUs = existingCUs.filter(cu => cu.user_id === userId);
      const newClinicIds = new Set(this.wizardUserForm.assignments.map(a => a.clinicId));
      for (const cu of userCUs) { if (!newClinicIds.has(cu.clinic_id)) await this.adminService.deleteClinicUser(cu.id!); }
      for (const assignment of this.wizardUserForm.assignments) {
        const existingCU = userCUs.find(cu => cu.clinic_id === assignment.clinicId);
        const cuPayload: any = {
          subscription_id: this.wizardSelectedSub!.id, clinic_id: assignment.clinicId,
          user_id: userId, roles: [assignment.role], status: 'active', display_name: this.wizardUserForm.name.trim(),
        };
        if (assignment.role === 'doctor' && Object.keys(assignment.availability).length > 0) cuPayload.availability = assignment.availability;
        if (existingCU) await this.adminService.updateClinicUser(existingCU.id!, cuPayload);
        else await this.adminService.createClinicUser(cuPayload);
      }

      const updated: AdminUserState = {
        userId, email: userPayload.email, name: userPayload.name, specialization: userPayload.specialization,
        global_roles: [...this.wizardUserForm.global_roles], status: this.wizardUserForm.status,
        assignments: this.wizardUserForm.assignments.map(a => ({
          ...a, clinicName: this.wizardClinics.find(c => c.id === a.clinicId)?.name || a.clinicId,
          availability: this.deepCopyAvail(a.availability),
        })),
      };
      const idx = this.wizardUsers.findIndex(u => u.userId === userId);
      if (idx >= 0) this.wizardUsers[idx] = updated; else this.wizardUsers.push(updated);
      this.wizardShowUserForm = false; this.wizardEditingUser = null;
      this.wizardSuccess = '✓ User saved!';
    } catch (e: any) { this.wizardError = 'Failed to save user: ' + e.message; }
    finally { this.wizardIsLoading = false; this.cdr.detectChanges(); }
  }

  async deleteWizardUser(user: AdminUserState): Promise<void> {
    const ok = await this.showConfirm('Delete User', `Delete "${user.name}" (${user.email})?`);
    if (!ok) return;
    this.wizardIsLoading = true;
    try {
      if (!user.userId) return;
      const allCU = await this.adminService.getClinicUsers(this.wizardSelectedSub!.id);
      for (const cu of allCU.filter(cu => cu.user_id === user.userId)) await this.adminService.deleteClinicUser(cu.id!);
      await this.adminService.deleteUser(user.userId);
      this.wizardUsers = this.wizardUsers.filter(u => u.userId !== user.userId);
      this.wizardSuccess = '✓ User deleted.';
    } catch (e: any) { this.wizardError = 'Failed to delete user: ' + e.message; }
    finally { this.wizardIsLoading = false; this.cdr.detectChanges(); }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  clearWizardMessages(): void { this.wizardError = ''; this.wizardSuccess = ''; }

  /** Pre-fills newSub from an incomplete subscription document so the admin can
   *  review and complete existing values without starting from scratch. */
  private _prefillNewSubFromIncomplete(sub: Partial<Subscription>): void {
    this.newSub = {
      entity_name: sub.entity_name?.trim() || '',
      owner_email: sub.owner_email?.trim() || this.adminEmail,
      billing_email: sub.billing_email?.trim() || '',
      plan_name: ((sub.plan?.name) as 'basic' | 'premium') || 'basic',
      max_clinics: sub.plan?.limits?.max_clinics || 5,
      max_doctors: sub.plan?.limits?.max_doctors || 10,
      max_appointments_per_day: sub.plan?.limits?.max_appointments_per_day || 50,
      status: (sub.status as 'active' | 'inactive' | 'suspended') || 'active',
    };
  }

  private emptyClinicForm(): AdminClinicState {
    return { id: '', name: '', address: '', phone: '', email: '', subscription_id: '',
      weekdays: ['M', 'T', 'W', 'Th', 'F'], timings: [{ label: 'FH', start: '09:00', end: '13:00' }, { label: 'SH', start: '14:00', end: '18:00' }] };
  }

  private emptyUserForm(): AdminUserState {
    return { email: '', name: '', specialization: '', global_roles: [], status: 'active', assignments: [] };
  }

  private deepCopyAvail(avail: ClinicUserAvailability): ClinicUserAvailability {
    const copy: ClinicUserAvailability = {};
    for (const day of Object.keys(avail)) copy[day] = [...(avail[day] || [])];
    return copy;
  }
}
