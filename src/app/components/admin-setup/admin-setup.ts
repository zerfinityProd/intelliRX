// src/app/components/admin-setup/admin-setup.ts
import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom, filter } from 'rxjs';
import { AdminService, AdminUser } from '../../services/adminService';
import { AuthenticationService } from '../../services/authenticationService';
import { Subscription } from '../../models/subscription.model';
import { ClinicUserAvailability } from '../../models/clinic-user.model';
import { NavbarComponent } from '../navbar/navbar';

// ── Local interfaces ──────────────────────────────────────────────────────────

export interface TimingBlock {
  label: string;
  start: string;
  end: string;
}

export interface AdminClinicState {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  subscription_id: string;
  weekdays: string[];
  timings: TimingBlock[];
  created_at?: string;
  updated_at?: string;
}

export interface UserClinicAssignment {
  clinicUserId?: string;
  clinicId: string;
  clinicName: string;
  role: 'doctor' | 'receptionist';
  availability: ClinicUserAvailability;
}

export interface AdminUserState {
  userId?: string;
  email: string;
  name: string;
  specialization?: string;
  global_roles: string[];
  status: 'active' | 'inactive';
  assignments: UserClinicAssignment[];
  created_at?: string;
  updated_at?: string;
}

export interface PermissionSet {
  canAddPatient: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAddVisit: boolean;
  canEditVisit: boolean;
  canAppointment: boolean;
  canCancel: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './admin-setup.html',
  styleUrl: './admin-setup.css',
})
export class AdminSetupComponent implements OnInit {
  private adminService = inject(AdminService);
  private authService = inject(AuthenticationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  // ── Confirmation dialog ──────────────────────────────────────────────────
  confirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  private confirmResolve: ((v: boolean) => void) | null = null;

  /** Shows the custom confirmation modal. Resolves true on Yes, false on No/Cancel. */
  showConfirm(title: string, message: string): Promise<boolean> {
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.confirmVisible = true;
    this.cdr.detectChanges();
    return new Promise(resolve => { this.confirmResolve = resolve; });
  }
  onConfirmYes() { this.confirmVisible = false; this.confirmResolve?.(true);  this.confirmResolve = null; }
  onConfirmNo()  { this.confirmVisible = false; this.confirmResolve?.(false); this.confirmResolve = null; }

  // ── Step management ──────────────────────────────────────────────────────

  currentStep = 1;
  /** True when navigated from dashboard via ?step=N — hides sidebar and step bar */
  focusedMode = false;
  readonly steps = [
    { num: 1, label: 'Subscription', icon: '🏢' },
    { num: 2, label: 'Clinics', icon: '🏥' },
    { num: 3, label: 'Permissions', icon: '🔑' },
    { num: 4, label: 'Users', icon: '👥' },
    { num: 5, label: 'Review', icon: '✅' },
  ];

  /** True only during explicit save/delete operations (shows blocking overlay) */
  isLoading = false;
  /** True during background data fetches (shows inline indicator, not overlay) */
  isFetching = false;
  /** True while ngOnInit is resolving — prevents any step from flashing on screen */
  isInitializing = true;
  errorMessage = '';
  successMessage = '';

  // ── Step 1: Subscription ─────────────────────────────────────────────────

  subscriptions: (Subscription & { id: string })[] = [];
  selectedSubscription: (Subscription & { id: string }) | null = null;
  isCreatingSubscription = false;

  newSub = {
    entity_name: '',
    owner_email: '',
    billing_email: '',
    plan_name: 'basic' as 'basic' | 'premium',
    max_clinics: 5,
    max_doctors: 10,
    max_appointments_per_day: 50,
    status: 'active' as 'active' | 'inactive' | 'suspended',
  };

  // ── Step 2: Clinics ──────────────────────────────────────────────────────

  clinics: AdminClinicState[] = [];
  showClinicForm = false;
  editingClinic: AdminClinicState | null = null;

  clinicForm: AdminClinicState = this.emptyClinicForm();

  readonly allWeekdays = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
  readonly weekdayLabels: Record<string, string> = {
    M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', Sa: 'Sat', Su: 'Sun',
  };

  // ── Step 3: Roles & Permissions ──────────────────────────────────────────

  readonly permissionDefs: { key: keyof PermissionSet; label: string; desc: string }[] = [
    { key: 'canAddPatient', label: 'Add Patient', desc: 'Register new patient records' },
    { key: 'canEdit', label: 'Edit Patient', desc: 'Modify patient information' },
    { key: 'canDelete', label: 'Delete Records', desc: 'Delete patients / visits' },
    { key: 'canAddVisit', label: 'Add Visit', desc: 'Create prescriptions & visit notes' },
    { key: 'canEditVisit', label: 'Edit Visit', desc: 'Modify existing visit records' },
    { key: 'canAppointment', label: 'Book Appointment', desc: 'Schedule appointments' },
    { key: 'canCancel', label: 'Cancel Appointment', desc: 'Cancel existing appointments' },
  ];

  doctorPermissions: PermissionSet = {
    canAddPatient: true, canEdit: true, canDelete: false,
    canAddVisit: true, canEditVisit: true, canAppointment: true, canCancel: true,
  };
  receptionistPermissions: PermissionSet = {
    canAddPatient: true, canEdit: false, canDelete: false,
    canAddVisit: false, canEditVisit: false, canAppointment: true, canCancel: true,
  };

  // ── Step 4: Users ────────────────────────────────────────────────────────

  users: AdminUserState[] = [];
  showUserForm = false;
  editingUser: AdminUserState | null = null;
  userForm: AdminUserState = this.emptyUserForm();
  /** Hard-blocking conflicts — doctor physically cannot be at two places (CANNOT save). */
  conflictErrors: string[] = [];
  /** Soft informational warnings (currently unused, kept for future use). */
  conflictWarnings: string[] = [];

  // ── Step 5: Review ───────────────────────────────────────────────────────

  isSaving = false;
  saveComplete = false;

  // ─────────────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async ngOnInit() {
    await firstValueFrom(this.authService.authReady$.pipe(filter(ready => ready)));

    await this.loadSubscriptions();

    // ── Restore selected subscription from sessionStorage (survives refresh) ──
    const savedSubId = sessionStorage.getItem('adminSetup_selectedSubId');
    if (savedSubId) {
      const found = this.subscriptions.find(s => s.id === savedSubId);
      if (found) this.selectedSubscription = found;
    }

    // ── Focused mode: only when the dashboard passes ?focused=1 explicitly.
    //    On a plain page refresh ?step=N exists but ?focused is absent,
    //    so the sidebar and step-bar remain visible as expected.
    const focusedParam = this.route.snapshot.queryParamMap.get('focused');
    if (focusedParam === '1') {
      this.focusedMode = true;
    }

    // ── Restore current step from URL (?step=N), written by syncStepToUrl ──
    const stepParam = this.route.snapshot.queryParamMap.get('step');
    if (stepParam) {
      const requestedStep = parseInt(stepParam, 10);
      if (!isNaN(requestedStep) && requestedStep >= 1 && requestedStep <= 5) {
        this.currentStep = requestedStep;
        await this.onStepEnter(requestedStep, 1);
      }
    }

    this.isInitializing = false;
    this.cdr.detectChanges();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Navigation helpers
  // ─────────────────────────────────────────────────────────────────────────

  getStepStatus(step: number): 'completed' | 'current' | 'upcoming' {
    if (step < this.currentStep) return 'completed';
    if (step === this.currentStep) return 'current';
    return 'upcoming';
  }

  async goToStep(step: number) {
    if (step < 1 || step > 5) return;
    if (step > this.currentStep && !this.validateCurrentStep()) return;
    const prev = this.currentStep;
    this.currentStep = step;
    this.syncStepToUrl();
    await this.onStepEnter(step, prev);
  }

  async nextStep() {
    if (!this.validateCurrentStep()) return;
    const next = this.currentStep + 1;
    if (next > 5) return;
    this.currentStep = next;
    this.syncStepToUrl();
    await this.onStepEnter(next, next - 1);
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.syncStepToUrl();
    }
  }

  /**
   * Writes the current step into the URL query-param so that a page refresh
   * restores exactly the same step (instead of falling back to step 1).
   * queryParamsHandling:'merge' also preserves any ?focused=1 param that
   * was set by the dashboard when entering focused mode.
   */
  private syncStepToUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: this.currentStep },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async onStepEnter(step: number, fromStep: number) {
    this.clearMessages();
    if (step === 2) await this.loadClinics();
    if (step === 3 && fromStep < 3) await this.loadRolePermissions();
    if (step === 4) {
      // Always ensure clinics are loaded first — the user form's clinic dropdown
      // depends on this.clinics being populated. If the user jumped directly to
      // Step 4 without visiting Step 2, clinics would be empty.
      if (!this.clinics.length) await this.loadClinics();
      if (fromStep < 4) await this.loadUsers();
    }
  }

  validateCurrentStep(): boolean {
    this.errorMessage = '';
    if (this.currentStep === 1 && !this.selectedSubscription) {
      this.errorMessage = 'Please select or create a subscription first.';
      return false;
    }
    return true;
  }

  navigateToHome() {
    this.router.navigate(['/home']);
  }

  navigateToDashboard() {
    // Clear persisted admin-setup session state so the next entry starts fresh.
    sessionStorage.removeItem('adminSetup_selectedSubId');
    this.router.navigate(['/admin-dashboard']);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Step 1 – Subscriptions
  // ─────────────────────────────────────────────────────────────────────────

  async loadSubscriptions() {
    this.isFetching = true;
    this.errorMessage = '';
    try {
      const currentEmail = this.authService.currentUserValue?.email?.toLowerCase().trim() ?? '';
      const allSubs = await this.adminService.getSubscriptions();

      // Filter to subscriptions owned by this admin.
      // Match owner_email OR billing_email (trimmed, lowercase) to be robust against
      // minor data inconsistencies (e.g. whitespace, casing).
      this.subscriptions = currentEmail
        ? allSubs.filter(s => {
            const ownerMatch = (s.owner_email ?? '').toLowerCase().trim() === currentEmail;
            const billingMatch = (s.billing_email ?? '').toLowerCase().trim() === currentEmail;
            return ownerMatch || billingMatch;
          })
        : allSubs;

      // Auto-select if only one subscription exists and none is selected yet
      if (this.subscriptions.length === 1 && !this.selectedSubscription) {
        this.selectedSubscription = this.subscriptions[0];
      }
    } catch (e: any) {
      this.errorMessage = 'Failed to load subscriptions: ' + (e?.message || 'Unknown error');
    } finally {
      this.isFetching = false;
    }
  }

  selectSubscription(sub: Subscription & { id: string }) {
    this.selectedSubscription = sub;
    this.isCreatingSubscription = false;
    this.clearMessages();
    // Persist so a page refresh restores this selection automatically.
    sessionStorage.setItem('adminSetup_selectedSubId', sub.id);
    this.cdr.detectChanges(); // ensure card highlights instantly
  }

  startNewSubscription() {
    this.selectedSubscription = null;
    this.isCreatingSubscription = true;
    this.newSub = {
      entity_name: '',
      owner_email: this.authService.currentUserValue?.email || '',
      billing_email: '',
      plan_name: 'basic',
      max_clinics: 5,
      max_doctors: 10,
      max_appointments_per_day: 50,
      status: 'active',
    };
  }

  async createSubscription() {
    if (!this.newSub.entity_name.trim() || !this.newSub.owner_email.trim()) {
      this.errorMessage = 'Entity name and owner email are required.';
      return;
    }
    this.isLoading = true;
    try {
      // Compute the next sequential ID from our local cache — no extra network call.
      const id = this.adminService.computeNextSubscriptionId(this.subscriptions.map(s => s.id));
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
      await this.adminService.createSubscription(subData, id);
      // Update local state immediately — avoids a second Firestore fetch.
      const now = new Date().toISOString();
      const created = { ...subData, id, created_at: now, updated_at: now } as Subscription & { id: string };
      this.subscriptions.push(created);
      this.selectSubscription(created);
      this.isCreatingSubscription = false;
      this.successMessage = '✓ Subscription created successfully!';
    } catch (e: any) {
      this.errorMessage = 'Failed to create subscription: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  async deleteSubscription(sub: Subscription & { id: string }) {
    const ok = await this.showConfirm(
      'Delete Subscription',
      `Are you sure you want to delete "${sub.entity_name}"? This will NOT automatically delete its clinics.`
    );
    if (!ok) return;
    this.isLoading = true;
    try {
      await this.adminService.deleteSubscription(sub.id);
      if (this.selectedSubscription?.id === sub.id) this.selectedSubscription = null;
      // Update local state immediately — no re-fetch needed.
      this.subscriptions = this.subscriptions.filter(s => s.id !== sub.id);
      this.successMessage = '✓ Subscription deleted.';
    } catch (e: any) {
      this.errorMessage = 'Failed to delete subscription: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Step 2 – Clinics
  // ─────────────────────────────────────────────────────────────────────────

  async loadClinics() {
    if (!this.selectedSubscription) return;
    this.isFetching = true;
    this.errorMessage = '';
    try {
      const rawClinics = await this.adminService.getClinicsForSubscription(this.selectedSubscription.id);
      this.clinics = await Promise.all(
        rawClinics.map(async c => {
          let schedule = (c as any).schedule;
          if (!schedule?.timings?.length) {
            const loaded = await this.adminService.getClinicSchedule(c.id!);
            if (loaded) schedule = loaded;
          }
          return {
            id: c.id!,
            name: c.name,
            address: c.address || '',
            phone: c.phone || '',
            email: c.email || '',
            subscription_id: c.subscription_id,
            weekdays: schedule?.weekdays || [],
            timings: schedule?.timings || [],
            created_at: c.created_at,
            updated_at: c.updated_at,
          } as AdminClinicState;
        })
      );
    } catch (e: any) {
      this.errorMessage = 'Failed to load clinics: ' + (e?.message || 'Unknown error');
    } finally {
      this.isFetching = false;
    }
  }

  openNewClinicForm() {
    this.clinicForm = this.emptyClinicForm();
    this.editingClinic = null;
    this.showClinicForm = true;
    this.clearMessages();
  }

  editClinic(clinic: AdminClinicState) {
    this.clinicForm = {
      ...clinic,
      weekdays: [...clinic.weekdays],
      timings: clinic.timings.map(t => ({ ...t })),
    };
    this.editingClinic = clinic;
    this.showClinicForm = true;
    this.clearMessages();
  }

  cancelClinicForm() {
    this.showClinicForm = false;
    this.editingClinic = null;
  }

  async saveClinic() {
    if (!this.clinicForm.name.trim()) {
      this.errorMessage = 'Clinic name is required.';
      return;
    }
    if (this.clinicForm.timings.some(t => !t.label.trim() || !t.start || !t.end)) {
      this.errorMessage = 'All timing blocks must have a label, start time, and end time.';
      return;
    }
    this.isLoading = true;
    try {
      const schedule = {
        weekdays: [...this.clinicForm.weekdays],
        timings: this.clinicForm.timings.map(t => ({ ...t })),
      };
      const clinicData = {
        name: this.clinicForm.name.trim(),
        address: this.clinicForm.address.trim(),
        phone: this.clinicForm.phone.trim(),
        email: this.clinicForm.email.trim().toLowerCase(),
        schedule,
      };
      const now = new Date().toISOString();

      if (this.editingClinic) {
        await this.adminService.updateClinic(this.editingClinic.id, clinicData);
        // Update local state directly — avoids reloading all clinics from Firestore
        const idx = this.clinics.findIndex(c => c.id === this.editingClinic!.id);
        if (idx >= 0) {
          this.clinics[idx] = {
            ...this.clinics[idx],
            name: clinicData.name,
            address: clinicData.address,
            phone: clinicData.phone,
            email: clinicData.email,
            weekdays: schedule.weekdays,
            timings: schedule.timings,
            updated_at: now,
          };
        }
      } else {
        // Compute next clinic ID from local list — zero extra network calls.
        const newClinicId = this.adminService.computeNextClinicId(this.clinics.map(c => c.id));
        await this.adminService.createClinic({
          ...clinicData,
          subscription_id: this.selectedSubscription!.id,
          doctor_ids: [],
        }, newClinicId);
        // Append to local state directly — avoids reloading all clinics from Firestore
        this.clinics.push({
          id: newClinicId,
          name: clinicData.name,
          address: clinicData.address,
          phone: clinicData.phone,
          email: clinicData.email,
          subscription_id: this.selectedSubscription!.id,
          weekdays: schedule.weekdays,
          timings: schedule.timings,
          created_at: now,
          updated_at: now,
        });
      }
      this.showClinicForm = false;
      this.editingClinic = null;
      this.successMessage = '✓ Clinic saved successfully!';
    } catch (e: any) {
      this.errorMessage = 'Failed to save clinic: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  async deleteClinic(clinic: AdminClinicState) {
    const ok = await this.showConfirm(
      'Delete Clinic',
      `Are you sure you want to delete "${clinic.name}"? All user assignments for this clinic will also be removed.`
    );
    if (!ok) return;
    this.isLoading = true;
    try {
      const cuList = await this.adminService.getClinicUsersForClinic(clinic.id);
      for (const cu of cuList) await this.adminService.deleteClinicUser(cu.id!);
      await this.adminService.deleteClinic(clinic.id);
      this.clinics = this.clinics.filter(c => c.id !== clinic.id);
      this.successMessage = '✓ Clinic deleted.';
    } catch (e: any) {
      this.errorMessage = 'Failed to delete clinic: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  toggleWeekday(day: string) {
    const idx = this.clinicForm.weekdays.indexOf(day);
    if (idx >= 0) this.clinicForm.weekdays.splice(idx, 1);
    else this.clinicForm.weekdays.push(day);
  }

  isDaySelected(day: string): boolean {
    return this.clinicForm.weekdays.includes(day);
  }

  addTimingBlock() {
    const count = this.clinicForm.timings.length;
    // Suggest sensible defaults based on existing blocks
    const lastEnd = count > 0 ? this.clinicForm.timings[count - 1].end : '09:00';
    const suggestedLabel = count === 0 ? 'FH' : count === 1 ? 'SH' : `Block ${count + 1}`;
    this.clinicForm.timings.push({ label: suggestedLabel, start: lastEnd, end: '18:00' });
  }

  removeTimingBlock(index: number) {
    if (this.clinicForm.timings.length <= 1) {
      this.errorMessage = 'At least one timing block is required.';
      return;
    }
    this.clinicForm.timings.splice(index, 1);
  }

  // ── Time slider helpers ──────────────────────────────────────────────────
  timeToMinutes(time: string): number {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 25;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  timeToPercent(time: string): number {
    return (this.timeToMinutes(time) / 1440) * 100;
  }

  onStartChange(t: { label: string; start: string; end: string }, event: Event, index: number): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    const timings = this.clinicForm.timings;
    const maxVal = this.timeToMinutes(t.end) - 15;
    const prevEndMinutes = index > 0 ? this.timeToMinutes(timings[index - 1].end) + 15 : 0;
    t.start = this.minutesToTime(Math.max(prevEndMinutes, Math.min(val, maxVal)));
    this.cdr.detectChanges();
  }

  onEndChange(t: { label: string; start: string; end: string }, event: Event, index: number): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    const timings = this.clinicForm.timings;
    const minVal = this.timeToMinutes(t.start) + 15;
    const nextStartMinutes = index < timings.length - 1
      ? this.timeToMinutes(timings[index + 1].start) - 15
      : 1440;
    t.end = this.minutesToTime(Math.min(nextStartMinutes, Math.max(val, minVal)));
    this.cdr.detectChanges();
  }

  getClinicScheduleSummary(clinic: AdminClinicState): string {
    if (!clinic.weekdays.length) return 'No schedule set';
    const days = clinic.weekdays.map(d => this.weekdayLabels[d] || d).join(', ');
    const times = clinic.timings.map(t => `${t.label} (${t.start}–${t.end})`).join(', ');
    return `${days} | ${times}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Step 3 – Roles & Permissions
  // ─────────────────────────────────────────────────────────────────────────

  async loadRolePermissions() {
    this.isFetching = true;
    try {
      const doctorPerms = await this.adminService.getRolePermissions('doctor');
      const receptPerms = await this.adminService.getRolePermissions('receptionist');

      this.permissionDefs.forEach(p => {
        (this.doctorPermissions as any)[p.key] = doctorPerms.includes(p.key);
        (this.receptionistPermissions as any)[p.key] = receptPerms.includes(p.key);
      });
    } catch (e: any) {
      this.errorMessage = 'Failed to load role permissions: ' + (e?.message || 'Unknown error');
    } finally {
      this.isFetching = false;
    }
  }

  async saveRolePermissions() {
    this.isLoading = true;
    try {
      const doctorPerms = this.permissionDefs
        .filter(p => this.doctorPermissions[p.key])
        .map(p => p.key as string);
      const receptPerms = this.permissionDefs
        .filter(p => this.receptionistPermissions[p.key])
        .map(p => p.key as string);
      await this.adminService.setRolePermissions('doctor', doctorPerms);
      await this.adminService.setRolePermissions('receptionist', receptPerms);
      this.successMessage = '✓ Role permissions saved!';
    } catch (e: any) {
      this.errorMessage = 'Failed to save permissions: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  countActivePerms(perms: PermissionSet): number {
    return Object.values(perms).filter(Boolean).length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Step 4 – Users & Assignments
  // ─────────────────────────────────────────────────────────────────────────

  async loadUsers() {
    if (!this.selectedSubscription) return;
    this.isFetching = true;
    try {
      const allCU = await this.adminService.getClinicUsers(this.selectedSubscription.id);
      const userIds = [...new Set(allCU.map(cu => cu.user_id).filter(Boolean))];

      this.users = [];
      for (const userId of userIds) {
        const userDoc = await this.adminService.getUserById(userId);
        if (!userDoc) continue;

        const assignments: UserClinicAssignment[] = allCU
          .filter(cu => cu.user_id === userId)
          .map(cu => {
            const clinic = this.clinics.find(c => c.id === cu.clinic_id);
            return {
              clinicUserId: cu.id,
              clinicId: cu.clinic_id,
              clinicName: clinic?.name || cu.clinic_id,
              role: ((cu.roles || ['receptionist'])[0]) as 'doctor' | 'receptionist',
              availability: (cu as any).availability || {},
            };
          });

        this.users.push({
          userId,
          email: userDoc.email,
          name: userDoc.name,
          specialization: userDoc.specialization || '',
          global_roles: userDoc.global_roles || [],
          status: userDoc.status || 'active',
          assignments,
          created_at: userDoc.created_at,
          updated_at: userDoc.updated_at,
        });
      }
    } catch (e: any) {
      this.errorMessage = 'Failed to load users: ' + (e?.message || 'Unknown error');
    } finally {
      this.isFetching = false;
    }
  }

  openNewUserForm() {
    this.userForm = this.emptyUserForm();
    this.editingUser = null;
    this.conflictWarnings = [];
    this.conflictErrors = [];
    this.showUserForm = true;
    this.clearMessages();
  }

  editUser(user: AdminUserState) {
    this.userForm = {
      ...user,
      global_roles: [...user.global_roles],
      assignments: user.assignments.map(a => ({
        ...a,
        availability: this.deepCopyAvail(a.availability),
      })),
    };
    this.editingUser = user;
    this.conflictWarnings = [];
    this.conflictErrors = [];
    this.showUserForm = true;
    this.clearMessages();
  }

  cancelUserForm() {
    this.showUserForm = false;
    this.editingUser = null;
    this.conflictWarnings = [];
    this.conflictErrors = [];
  }

  addClinicAssignment() {
    if (!this.clinics.length) {
      this.errorMessage = 'No clinics available. Add clinics first.';
      return;
    }
    const firstClinic = this.clinics[0];
    this.userForm.assignments.push({
      clinicId: firstClinic.id,
      clinicName: firstClinic.name,
      role: 'receptionist',
      availability: {},
    });
  }

  removeClinicAssignment(index: number) {
    this.userForm.assignments.splice(index, 1);
    this.checkConflictsSync();
  }

  onAssignmentClinicChange(assignment: UserClinicAssignment, clinicId: string) {
    const clinic = this.clinics.find(c => c.id === clinicId);
    assignment.clinicId = clinicId;
    assignment.clinicName = clinic?.name || clinicId;
    assignment.availability = {};
    this.checkConflictsSync();
  }

  onAssignmentRoleChange(assignment: UserClinicAssignment) {
    if (assignment.role !== 'doctor') assignment.availability = {};
    this.checkConflictsSync();
  }

  getClinicForAssignment(clinicId: string): AdminClinicState | undefined {
    return this.clinics.find(c => c.id === clinicId);
  }

  toggleAvailability(assignment: UserClinicAssignment, day: string, block: string) {
    if (!assignment.availability[day]) assignment.availability[day] = [];
    const idx = assignment.availability[day].indexOf(block);
    if (idx >= 0) assignment.availability[day].splice(idx, 1);
    else assignment.availability[day].push(block);
    this.checkConflictsSync();
  }

  isBlockSelected(assignment: UserClinicAssignment, day: string, block: string): boolean {
    return (assignment.availability[day] || []).includes(block);
  }

  /** Synchronous conflict check across assignments within the form.
   * Detected conflicts are HARD ERRORS — the form cannot be saved until resolved. */
  checkConflictsSync() {
    this.conflictErrors = [];
    this.conflictWarnings = [];
    const doctorAssignments = this.userForm.assignments.filter(a => a.role === 'doctor');

    for (let i = 0; i < doctorAssignments.length; i++) {
      for (let j = i + 1; j < doctorAssignments.length; j++) {
        const a1 = doctorAssignments[i];
        const a2 = doctorAssignments[j];
        if (a1.clinicId === a2.clinicId) continue;

        const c1 = this.getClinicForAssignment(a1.clinicId);
        const c2 = this.getClinicForAssignment(a2.clinicId);

        for (const day of Object.keys(a1.availability)) {
          const blocks1 = a1.availability[day] || [];
          const blocks2 = (a2.availability || {})[day] || [];
          const overlap = blocks1.filter(b => blocks2.includes(b));
          if (overlap.length) {
            this.conflictErrors.push(
              `${this.weekdayLabels[day] || day}: "${c1?.name || a1.clinicId}" and "${c2?.name || a2.clinicId}" overlap on [${overlap.join(', ')}] — a doctor cannot be at two clinics simultaneously.`
            );
          }
        }
      }
    }
  }

  /** True when the user form has unresolved scheduling conflicts that block saving. */
  get hasConflictErrors(): boolean {
    return this.conflictErrors.length > 0;
  }

  async saveUser() {
    if (!this.userForm.email.trim() || !this.userForm.name.trim()) {
      this.errorMessage = 'Email and name are required.';
      return;
    }

    // Hard block: intra-form schedule conflicts must be resolved before saving.
    if (this.conflictErrors.length) {
      this.errorMessage = 'Cannot save: resolve all scheduling conflicts first. A doctor cannot be scheduled at two clinics at the same time.';
      return;
    }

    this.isLoading = true;
    try {
      let userId = this.userForm.userId;
      const userPayload: Omit<AdminUser, 'id' | 'created_at' | 'updated_at'> = {
        email: this.userForm.email.trim().toLowerCase(),
        name: this.userForm.name.trim(),
        specialization: this.userForm.specialization?.trim() || '',
        global_roles: this.userForm.global_roles,
        status: this.userForm.status,
      };

      if (userId) {
        await this.adminService.updateUser(userId, userPayload);
      } else {
        const existing = await this.adminService.getUserByEmail(userPayload.email);
        if (existing) {
          userId = existing.id!;
          await this.adminService.updateUser(userId, userPayload);
        } else {
          userId = await this.adminService.createUser(userPayload);
        }
      }

      // ── Cross-subscription conflict check ──────────────────────────────────
      // Even if the admin has two separate subscriptions, a doctor cannot be
      // physically present at two clinics (from ANY subscription) at the same time.
      // Fetch all clinic_user records globally for this user and check overlaps.
      const crossConflicts: string[] = [];
      const doctorAssignments = this.userForm.assignments.filter(a => a.role === 'doctor');

      if (doctorAssignments.length > 0 && userId) {
        // Fetch ALL clinic_user records for this user (across all subscriptions)
        const allUserCUs = await this.adminService.getAllClinicUsersForUser(userId);

        // Exclude clinics that are part of this current save (they'll be overwritten)
        const savingClinicIds = new Set(doctorAssignments.map(a => a.clinicId));
        const externalCuDocs = allUserCUs.filter(
          cu => !savingClinicIds.has(cu.clinic_id) &&
                (cu.roles || []).includes('doctor')
        );

        for (const newAssignment of doctorAssignments) {
          for (const extCu of externalCuDocs) {
            const extAvail: { [day: string]: string[] } = (extCu as any).availability || {};
            const extClinicId: string = extCu.clinic_id || '(unknown)';

            for (const day of Object.keys(newAssignment.availability)) {
              const newBlocks: string[] = newAssignment.availability[day] || [];
              const extBlocks: string[] = extAvail[day] || [];
              const overlap = newBlocks.filter(b => extBlocks.includes(b));
              if (overlap.length > 0) {
                const newClinicName = this.clinics.find(c => c.id === newAssignment.clinicId)?.name || newAssignment.clinicId;
                crossConflicts.push(
                  `${this.weekdayLabels[day] || day}: "${newClinicName}" conflicts with another clinic (${extClinicId}) for [${overlap.join(', ')}].`
                );
              }
            }
          }
        }
      }

      if (crossConflicts.length > 0) {
        this.conflictErrors = crossConflicts;
        this.errorMessage = 'Cannot save: this doctor is already scheduled at another clinic during the same time slots. A doctor cannot be at two locations simultaneously.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }

      // ── Sync clinic assignments ────────────────────────────────────────────
      const existingCUs = await this.adminService.getClinicUsers(this.selectedSubscription!.id);
      const userCUs = existingCUs.filter(cu => cu.user_id === userId);
      const newClinicIds = new Set(this.userForm.assignments.map(a => a.clinicId));

      // Delete removed assignments
      for (const cu of userCUs) {
        if (!newClinicIds.has(cu.clinic_id)) {
          await this.adminService.deleteClinicUser(cu.id!);
        }
      }

      // Create or update each assignment
      for (const assignment of this.userForm.assignments) {
        const existingCU = userCUs.find(cu => cu.clinic_id === assignment.clinicId);
        const cuPayload: any = {
          subscription_id: this.selectedSubscription!.id,
          clinic_id: assignment.clinicId,
          user_id: userId,
          roles: [assignment.role],
          status: 'active',
          display_name: this.userForm.name.trim(),
        };
        if (assignment.role === 'doctor' && Object.keys(assignment.availability).length > 0) {
          cuPayload.availability = assignment.availability;
        }

        if (existingCU) {
          await this.adminService.updateClinicUser(existingCU.id!, cuPayload);
        } else {
          await this.adminService.createClinicUser(cuPayload);
        }
      }

      // Update local state directly — avoids N sequential getUserById Firestore calls
      const now = new Date().toISOString();
      const updatedAssignments: UserClinicAssignment[] = this.userForm.assignments.map(a => ({
        clinicUserId: a.clinicUserId,
        clinicId: a.clinicId,
        clinicName: this.clinics.find(c => c.id === a.clinicId)?.name || a.clinicId,
        role: a.role,
        availability: this.deepCopyAvail(a.availability),
      }));

      const existingIdx = this.users.findIndex(u => u.userId === userId);
      if (existingIdx >= 0) {
        // Update in-place
        this.users[existingIdx] = {
          ...this.users[existingIdx],
          email: userPayload.email,
          name: userPayload.name,
          specialization: userPayload.specialization,
          global_roles: [...this.userForm.global_roles],
          status: this.userForm.status,
          assignments: updatedAssignments,
          updated_at: now,
        };
      } else {
        // New user — push to local list
        this.users.push({
          userId,
          email: userPayload.email,
          name: userPayload.name,
          specialization: userPayload.specialization,
          global_roles: [...this.userForm.global_roles],
          status: this.userForm.status,
          assignments: updatedAssignments,
          created_at: now,
          updated_at: now,
        });
      }

      this.showUserForm = false;
      this.editingUser = null;
      this.conflictWarnings = [];
      this.conflictErrors = [];
      this.successMessage = '✓ User saved successfully!';
    } catch (e: any) {
      this.errorMessage = 'Failed to save user: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  async deleteUser(user: AdminUserState) {
    const ok = await this.showConfirm(
      'Delete User',
      `Are you sure you want to delete "${user.name}" (${user.email})? Their clinic assignments will also be removed.`
    );
    if (!ok) return;
    this.isLoading = true;
    try {
      if (!user.userId) return;
      const allCU = await this.adminService.getClinicUsers(this.selectedSubscription!.id);
      for (const cu of allCU.filter(cu => cu.user_id === user.userId)) {
        await this.adminService.deleteClinicUser(cu.id!);
      }
      await this.adminService.deleteUser(user.userId);
      this.users = this.users.filter(u => u.userId !== user.userId);
      this.successMessage = '✓ User deleted.';
    } catch (e: any) {
      this.errorMessage = 'Failed to delete user: ' + e.message;
    } finally {
      this.endOp();
    }
  }

  toggleGlobalRole(role: string) {
    const idx = this.userForm.global_roles.indexOf(role);
    if (idx >= 0) this.userForm.global_roles.splice(idx, 1);
    else this.userForm.global_roles.push(role);
  }

  hasGlobalRole(role: string): boolean {
    return this.userForm.global_roles.includes(role);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Step 5 – Review & Final Save
  // ─────────────────────────────────────────────────────────────────────────

  async finalSavePermissions() {
    this.isSaving = true;
    try {
      await this.saveRolePermissions();
      this.saveComplete = true;
      this.successMessage = '✓ All permissions saved! Setup is complete.';
    } finally {
      this.endOp();
    }
  }

  getUserRoleDisplay(user: AdminUserState): string {
    const roles: string[] = [];
    if (user.global_roles?.includes('admin')) roles.push('Admin');
    const hasDoctor = user.assignments.some(a => a.role === 'doctor');
    const hasRecept = user.assignments.some(a => a.role === 'receptionist');
    if (hasDoctor) roles.push('Doctor');
    if (hasRecept) roles.push('Receptionist');
    return roles.join(', ') || 'No Role';
  }

  getAvailabilitySummary(availability: ClinicUserAvailability): string {
    const entries = Object.entries(availability || {})
      .filter(([, blocks]) => blocks.length > 0)
      .map(([day, blocks]) => `${this.weekdayLabels[day] || day}: ${blocks.join('+')}`)
      .join(' | ');
    return entries || 'No availability set';
  }

  getPermissionSummary(perms: PermissionSet): string {
    return this.permissionDefs
      .filter(p => perms[p.key])
      .map(p => p.label)
      .join(', ') || 'None';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Utilities
  // ─────────────────────────────────────────────────────────────────────────

  clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }

  /**
   * Called in every finally block. Resets loading flags and forces Angular
   * change detection so the UI updates instantly even when async operations
   * complete outside Angular's NgZone (e.g. Firebase / HttpClient callbacks).
   */
  private endOp(): void {
    this.isLoading = false;
    this.isSaving = false;
    this.cdr.detectChanges();
  }

  private emptyClinicForm(): AdminClinicState {
    return {
      id: '',
      name: '',
      address: '',
      phone: '',
      email: '',
      subscription_id: '',
      weekdays: ['M', 'T', 'W', 'Th', 'F'],
      timings: [
        { label: 'FH', start: '09:00', end: '13:00' },
        { label: 'SH', start: '14:00', end: '18:00' },
      ],
    };
  }

  private emptyUserForm(): AdminUserState {
    return {
      email: '',
      name: '',
      specialization: '',
      global_roles: [],
      status: 'active',
      assignments: [],
    };
  }

  private deepCopyAvail(avail: ClinicUserAvailability): ClinicUserAvailability {
    const copy: ClinicUserAvailability = {};
    for (const day of Object.keys(avail)) copy[day] = [...(avail[day] || [])];
    return copy;
  }

  /**
   * Returns the first letter of a subscription's entity name for the avatar,
   * or '?' when entity_name is missing/empty (prevents charAt crash on blank records).
   */
  subInitial(sub: Subscription & { id: string }): string {
    return sub.entity_name?.trim()?.[0]?.toUpperCase() || '?';
  }

  /**
   * True when this subscription has enough data to display meaningfully.
   * Subscriptions with no entity_name are likely orphaned/incomplete records.
   */
  subHasData(sub: Subscription & { id: string }): boolean {
    return !!sub.entity_name?.trim();
  }
}
