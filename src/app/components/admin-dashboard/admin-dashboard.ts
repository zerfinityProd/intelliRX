// src/app/components/admin-dashboard/admin-dashboard.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthenticationService } from '../../services/authenticationService';
import { AdminService } from '../../services/adminService';
import { FirestoreApiService } from '../../services/firestore-api.service';
import { Subscription } from '../../models/subscription.model';
import { ClinicUserAvailability } from '../../models/clinic-user.model';
import { NavbarComponent } from '../navbar/navbar';

// ── Local interfaces ──────────────────────────────────────────────────────────

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
  assignments: UserClinicAssignment[];
}

type ActiveSection = 'clinics' | 'users' | null;

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

  // ── State ─────────────────────────────────────────────────────────────────
  isLoading = true;
  isSaving = false;
  adminName = '';
  adminEmail = '';
  activeSection: ActiveSection = null;
  private userDocId = '';

  // ── Subscription (read-only) ──────────────────────────────────────────────
  subscription: (Subscription & { id: string }) | null = null;
  assignedSubscriptionId = '';

  // ── Stats ─────────────────────────────────────────────────────────────────
  stats = { clinics: 0, doctors: 0, receptionists: 0, totalUsers: 0 };

  // ── Clinics ───────────────────────────────────────────────────────────────
  clinics: AdminClinicState[] = [];
  showClinicForm = false;
  editingClinic: AdminClinicState | null = null;
  clinicForm: AdminClinicState = this.emptyClinicForm();
  clinicSearch = '';

  readonly allWeekdays = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
  readonly weekdayLabels: Record<string, string> = {
    M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', Sa: 'Sat', Su: 'Sun',
  };

  // ── Users ─────────────────────────────────────────────────────────────────
  users: AdminUserState[] = [];
  showUserForm = false;
  editingUser: AdminUserState | null = null;
  userForm: AdminUserState = this.emptyUserForm();
  userSearch = '';

  // ── Confirm Dialog ────────────────────────────────────────────────────────
  confirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  private confirmResolve: ((v: boolean) => void) | null = null;

  // ── Toast ─────────────────────────────────────────────────────────────────
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  toastVisible = false;
  private toastTimer: any;

  // ── Getters ───────────────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }

  get subscriptionPlanLabel(): string {
    return (this.subscription?.plan?.name || 'basic').toUpperCase();
  }

  get filteredClinics(): AdminClinicState[] {
    if (!this.clinicSearch.trim()) return this.clinics;
    const q = this.clinicSearch.toLowerCase();
    return this.clinics.filter(c => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  }

  get filteredUsers(): AdminUserState[] {
    if (!this.userSearch.trim()) return this.users;
    const q = this.userSearch.toLowerCase();
    return this.users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await firstValueFrom(this.authService.authReady$.pipe(filter(r => r)));
    this.adminName = this.authService.currentUserValue?.name || 'Admin';
    this.adminEmail = this.authService.currentUserValue?.email || '';

    await this.loadSubscription();
    if (this.subscription) {
      await Promise.all([this.loadClinics(), this.loadUsers()]);
    }
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // Known plan defaults — used when plan.limits is not embedded in the
  // subscription doc AND the plans collection can't be read (security rules).
  private readonly PLAN_DEFAULTS: Record<string, { max_clinics: number; max_doctors: number }> = {
    starter: { max_clinics: 3, max_doctors: 3 },
    basic:   { max_clinics: 5, max_doctors: 5 },
    demo:    { max_clinics: 2, max_doctors: 2 },
    pro:     { max_clinics: 5, max_doctors: 5 },
    premium: { max_clinics: 10, max_doctors: 20 },
  };

  private async loadSubscription(): Promise<void> {
    try {
      const email = this.adminEmail.toLowerCase().trim();
      const userDocs = await this.api.runQuery('', {
        collectionId: 'users',
        filters: [{ field: 'email', op: '==', value: email }],
      });
      if (!userDocs.length) return;
      const userDoc = userDocs[0];
      this.userDocId = userDoc.id;
      let subscriptionId: string = userDoc.data['subscription_id'] || '';

      // Fallback: if the user doc doesn't have subscription_id,
      // search the subscriptions collection for this owner's email
      if (!subscriptionId) {
        try {
          const subDocs = await this.api.runQuery('', {
            collectionId: 'subscriptions',
            filters: [{ field: 'owner_email', op: '==', value: email }],
          });
          if (subDocs.length > 0) {
            subscriptionId = subDocs[0].id;
            // Also update the user doc so this lookup isn't needed next time
            await this.api.updateDocument('users', this.userDocId, { subscription_id: subscriptionId });
          }
        } catch (fallbackErr) {
          console.warn('[AdminDashboard] Fallback subscription lookup failed:', fallbackErr);
        }
      }

      this.assignedSubscriptionId = subscriptionId;
      if (subscriptionId) {
        const subDoc = await this.api.getDocument('subscriptions', subscriptionId);
        if (subDoc) {
          this.subscription = { ...(subDoc.data as Subscription), id: subDoc.id };

          // Normalize plan: Firestore may store it as a plain string (e.g. "starter")
          // but the model expects { name: string, limits: PlanLimits }
          const rawPlan = this.subscription.plan as any;
          if (typeof rawPlan === 'string') {
            this.subscription.plan = {
              name: rawPlan,
              limits: { max_clinics: 0, max_doctors: 0, max_appointments_per_day: 0 }
            };
          } else if (!rawPlan) {
            this.subscription.plan = {
              name: 'basic',
              limits: { max_clinics: 0, max_doctors: 0, max_appointments_per_day: 0 }
            };
          }

          // Check if plan.limits is already populated with real values
          const hasLimits = this.subscription.plan?.limits
            && (this.subscription.plan.limits.max_clinics > 0 || this.subscription.plan.limits.max_doctors > 0);

          if (!hasLimits) {
            const planName = (this.subscription.plan?.name || '').toLowerCase();

            // Try fetching from the 'plans' collection first
            let resolved = false;
            if (planName) {
              try {
                const planDoc = await this.api.getDocument('plans', planName);
                if (planDoc?.data && (planDoc.data['max_clinics'] || planDoc.data['max_doctors'])) {
                  this.subscription.plan.limits = {
                    max_clinics: planDoc.data['max_clinics'] ?? 0,
                    max_doctors: planDoc.data['max_doctors'] ?? 0,
                    max_appointments_per_day: 0,
                  };
                  resolved = true;
                }
              } catch (planErr) {
                console.warn('[AdminDashboard] Could not read plans collection, using defaults:', planErr);
              }
            }

            // Fall back to known defaults if plans collection was unreachable
            if (!resolved && planName && this.PLAN_DEFAULTS[planName]) {
              const defaults = this.PLAN_DEFAULTS[planName];
              this.subscription.plan.limits = {
                max_clinics: defaults.max_clinics,
                max_doctors: defaults.max_doctors,
                max_appointments_per_day: 0,
              };
            }
          }

          // Ensure limits object always exists
          if (!this.subscription.plan?.limits) {
            this.subscription.plan.limits = { max_clinics: 0, max_doctors: 0, max_appointments_per_day: 0 };
          }
        }
      }
    } catch (e: any) { this.showToast('Failed to load subscription', 'error'); }
  }

  private async loadClinics(): Promise<void> {
    if (!this.subscription) return;
    try {
      const raw = await this.adminService.getClinicsForSubscription(this.subscription.id);
      this.clinics = await Promise.all(raw.map(async c => {
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
      this.stats.clinics = this.clinics.length;
    } catch (e: any) { this.showToast('Failed to load clinics', 'error'); }
  }

  private async loadUsers(): Promise<void> {
    if (!this.subscription) return;
    try {
      const allCU = await this.adminService.getClinicUsers(this.subscription.id);
      const userIds = [...new Set(allCU.map(cu => cu.user_id).filter(Boolean))];
      this.users = [];
      for (const userId of userIds) {
        const userDoc = await this.adminService.getUserById(userId);
        if (!userDoc) continue;
        // Derive role from user doc's global_roles
        const globalRoles = userDoc.global_roles || [];
        let userRole: 'doctor' | 'receptionist' = 'receptionist';
        if (globalRoles.includes('doctor')) userRole = 'doctor';
        const assignments: UserClinicAssignment[] = allCU.filter(cu => cu.user_id === userId).map(cu => {
          const clinic = this.clinics.find(c => c.id === cu.clinic_id);
          return {
            clinicUserId: cu.id, clinicId: cu.clinic_id, clinicName: clinic?.name || cu.clinic_id,
            role: userRole,
            availability: (cu as any).availability || {},
          };
        });
        this.users.push({
          userId, email: userDoc.email, name: userDoc.name, specialization: userDoc.specialization || '',
          global_roles: userDoc.global_roles || [], status: userDoc.status || 'active', assignments,
        });
      }
      this.stats.totalUsers = this.users.length;
      this.stats.doctors = this.users.filter(u => u.assignments.some(a => a.role === 'doctor')).length;
      this.stats.receptionists = this.users.filter(u => u.assignments.some(a => a.role === 'receptionist')).length;
    } catch (e: any) { this.showToast('Failed to load users', 'error'); }
  }

  setSection(s: ActiveSection): void {
    this.activeSection = s;
    this.showClinicForm = false;
    this.showUserForm = false;
    this.cdr.detectChanges();
  }

  clearSection(): void {
    this.activeSection = null;
    this.showClinicForm = false;
    this.showUserForm = false;
    this.cdr.detectChanges();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/app/login']);
  }

  // ── Clinic CRUD ───────────────────────────────────────────────────────────
  openNewClinicForm(): void {
    this.clinicForm = this.emptyClinicForm();
    this.editingClinic = null;
    this.showClinicForm = true;
    this.cdr.detectChanges();
  }

  openEditClinicForm(clinic: AdminClinicState): void {
    this.clinicForm = { ...clinic, weekdays: [...clinic.weekdays], timings: clinic.timings.map(t => ({ ...t })) };
    this.editingClinic = clinic;
    this.showClinicForm = true;
    this.cdr.detectChanges();
  }

  cancelClinicForm(): void {
    this.showClinicForm = false;
    this.editingClinic = null;
    this.cdr.detectChanges();
  }

  async saveClinic(): Promise<void> {
    if (!this.clinicForm.name.trim()) { this.showToast('Clinic name is required', 'error'); return; }
    this.isSaving = true;
    try {
      const schedule = { weekdays: [...this.clinicForm.weekdays], timings: this.clinicForm.timings.map(t => ({ ...t })) };
      const clinicData = {
        name: this.clinicForm.name.trim(), address: this.clinicForm.address.trim(),
        phone: this.clinicForm.phone.trim(), email: this.clinicForm.email.trim().toLowerCase(), schedule,
      };
      const now = new Date().toISOString();
      if (this.editingClinic) {
        await this.adminService.updateClinic(this.editingClinic.id, clinicData);
        const idx = this.clinics.findIndex(c => c.id === this.editingClinic!.id);
        if (idx >= 0) this.clinics[idx] = { ...this.clinics[idx], ...clinicData, weekdays: schedule.weekdays, timings: schedule.timings, updated_at: now };
        this.showToast('Clinic updated successfully');
      } else {
        const newId = this.adminService.computeNextClinicId(this.clinics.map(c => c.id));
        await this.adminService.createClinic({ ...clinicData, subscription_id: this.subscription!.id, doctor_ids: [] }, newId);
        this.clinics.push({ id: newId, ...clinicData, subscription_id: this.subscription!.id, weekdays: schedule.weekdays, timings: schedule.timings, created_at: now, updated_at: now });
        this.stats.clinics = this.clinics.length;
        this.showToast('Clinic created successfully');
      }
      this.showClinicForm = false;
      this.editingClinic = null;
    } catch (e: any) { this.showToast('Failed to save clinic: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  async deleteClinic(clinic: AdminClinicState): Promise<void> {
    const ok = await this.showConfirmDialog('Delete Clinic', `Delete "${clinic.name}"? All assignments will also be removed.`);
    if (!ok) return;
    this.isSaving = true;
    try {
      const cuList = await this.adminService.getClinicUsersForClinic(clinic.id);
      for (const cu of cuList) await this.adminService.deleteClinicUser(cu.id!);
      await this.adminService.deleteClinic(clinic.id);
      this.clinics = this.clinics.filter(c => c.id !== clinic.id);
      this.stats.clinics = this.clinics.length;
      this.showToast('Clinic deleted');
    } catch (e: any) { this.showToast('Failed to delete clinic', 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  toggleWeekday(day: string): void {
    const idx = this.clinicForm.weekdays.indexOf(day);
    if (idx >= 0) this.clinicForm.weekdays.splice(idx, 1);
    else this.clinicForm.weekdays.push(day);
  }
  isDaySelected(day: string): boolean { return this.clinicForm.weekdays.includes(day); }

  addTimingBlock(): void {
    const count = this.clinicForm.timings.length;
    const lastEnd = count > 0 ? this.clinicForm.timings[count - 1].end : '09:00';
    const label = count === 0 ? 'FH' : count === 1 ? 'SH' : `Block ${count + 1}`;
    this.clinicForm.timings.push({ label, start: lastEnd, end: '18:00' });
  }
  removeTimingBlock(i: number): void { if (this.clinicForm.timings.length > 1) this.clinicForm.timings.splice(i, 1); }

  getScheduleSummary(clinic: AdminClinicState): string {
    if (!clinic.weekdays.length) return 'No schedule set';
    return clinic.weekdays.map(d => this.weekdayLabels[d] || d).join(', ') +
      ' · ' + clinic.timings.map(t => `${t.label} ${t.start}–${t.end}`).join(', ');
  }

  // ── Time slider helpers ────────────────────────────────────────────────────
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
  timeToPercent(time: string): number { return (this.timeToMinutes(time) / 1440) * 100; }

  onStartSliderChange(t: TimingBlock, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    const max = this.timeToMinutes(t.end) - 15;
    t.start = this.minutesToTime(Math.min(val, max));
    this.cdr.detectChanges();
  }
  onEndSliderChange(t: TimingBlock, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    const min = this.timeToMinutes(t.start) + 15;
    t.end = this.minutesToTime(Math.max(val, min));
    this.cdr.detectChanges();
  }

  // ── User CRUD ─────────────────────────────────────────────────────────────
  openNewUserForm(): void {
    this.userForm = this.emptyUserForm();
    if (this.clinics.length) {
      const c = this.clinics[0];
      this.userForm.assignments.push({ clinicId: c.id, clinicName: c.name, role: 'receptionist', availability: {} });
    }
    this.editingUser = null;
    this.showUserForm = true;
    this.cdr.detectChanges();
  }

  openEditUserForm(user: AdminUserState): void {
    this.userForm = {
      ...user, global_roles: [...user.global_roles],
      assignments: user.assignments.map(a => ({ ...a, availability: this.deepCopyAvail(a.availability) })),
    };
    this.editingUser = user;
    this.showUserForm = true;
    this.cdr.detectChanges();
  }

  cancelUserForm(): void {
    this.showUserForm = false;
    this.editingUser = null;
    this.cdr.detectChanges();
  }

  addClinicAssignment(): void {
    if (!this.clinics.length) { this.showToast('No clinics available. Add a clinic first.', 'error'); return; }
    const c = this.clinics[0];
    this.userForm.assignments.push({ clinicId: c.id, clinicName: c.name, role: 'receptionist', availability: {} });
    this.cdr.detectChanges();
  }

  removeClinicAssignment(i: number): void {
    this.userForm.assignments.splice(i, 1);
    this.cdr.detectChanges();
  }

  onAssignmentClinicChange(a: UserClinicAssignment, clinicId: string): void {
    const clinic = this.clinics.find(c => c.id === clinicId);
    a.clinicId = clinicId; a.clinicName = clinic?.name || clinicId; a.availability = {};
  }

  onAssignmentRoleChange(a: UserClinicAssignment): void { if (a.role !== 'doctor') a.availability = {}; }

  getClinicForAssignment(clinicId: string): AdminClinicState | undefined {
    return this.clinics.find(c => c.id === clinicId);
  }

  toggleAvailability(a: UserClinicAssignment, day: string, block: string): void {
    if (!a.availability[day]) a.availability[day] = [];
    const idx = a.availability[day].indexOf(block);
    if (idx >= 0) a.availability[day].splice(idx, 1); else a.availability[day].push(block);
  }
  isBlockSelected(a: UserClinicAssignment, day: string, block: string): boolean {
    return (a.availability[day] || []).includes(block);
  }

  isBlockBookedElsewhere(currentAssignment: UserClinicAssignment, day: string, block: string): boolean {
    if (currentAssignment.role !== 'doctor') return false;
    return this.userForm.assignments.some(a =>
      a !== currentAssignment &&
      a.role === 'doctor' &&
      (a.availability[day] || []).includes(block)
    );
  }

  async saveUser(): Promise<void> {
    if (!this.userForm.email.trim() || !this.userForm.name.trim()) {
      this.showToast('Email and name are required', 'error'); return;
    }

    // Intra-form conflict check
    const doctorAssignments = this.userForm.assignments.filter(a => a.role === 'doctor');
    for (let i = 0; i < doctorAssignments.length; i++) {
      for (let j = i + 1; j < doctorAssignments.length; j++) {
        const a1 = doctorAssignments[i];
        const a2 = doctorAssignments[j];
        const c1 = this.clinics.find(c => c.id === a1.clinicId);
        const c2 = this.clinics.find(c => c.id === a2.clinicId);
        const avail1 = a1.availability || {};
        const avail2 = a2.availability || {};
        const allDays = new Set([...Object.keys(avail1), ...Object.keys(avail2)]);
        for (const day of allDays) {
          const overlap = (avail1[day] || []).filter(b => (avail2[day] || []).includes(b));
          if (overlap.length > 0) {
            const dayLabel = this.weekdayLabels[day] || day;
            this.showToast(
              `${dayLabel}: "${c1?.name || a1.clinicId}" and "${c2?.name || a2.clinicId}" overlap on [${overlap.join(', ')}] — a doctor cannot be at two clinics simultaneously.`,
              'error'
            );
            return;
          }
        }
      }
    }

    this.isSaving = true;
    try {
      let userId = this.userForm.userId;
      const userPayload: any = {
        email: this.userForm.email.trim().toLowerCase(),
        name: this.userForm.name.trim(),
        specialization: this.userForm.specialization?.trim() || '',
        global_roles: this.userForm.global_roles,
        status: this.userForm.status,
        subscription_id: this.subscription!.id,
      };
      if (userId) {
        await this.adminService.updateUser(userId, userPayload);
      } else {
        const existing = await this.adminService.getUserByEmail(userPayload.email, this.subscription!.id);
        if (existing) { userId = existing.id!; await this.adminService.updateUser(userId, userPayload); }
        else { userId = await this.adminService.createUser(userPayload); }
      }

      // Cross-subscription conflict check
      const crossConflicts: string[] = [];
      if (doctorAssignments.length > 0 && userId) {
        const allUserCUs = await this.adminService.getAllClinicUsersForUser(userId);
        const savingClinicIds = new Set(doctorAssignments.map(a => a.clinicId));
        const externalCuDocs = allUserCUs.filter(
          cu => !savingClinicIds.has(cu.clinic_id)
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
        this.showToast('Cannot save: ' + crossConflicts[0], 'error');
        this.isSaving = false;
        this.cdr.detectChanges();
        return;
      }
      // Sync clinic assignments
      const existingCUs = await this.adminService.getClinicUsers(this.subscription!.id);
      const userCUs = existingCUs.filter(cu => cu.user_id === userId);
      const newClinicIds = new Set(this.userForm.assignments.map(a => a.clinicId));
      for (const cu of userCUs) { if (!newClinicIds.has(cu.clinic_id)) await this.adminService.deleteClinicUser(cu.id!); }
      for (const assignment of this.userForm.assignments) {
        const existingCU = userCUs.find(cu => cu.clinic_id === assignment.clinicId);
        const cuPayload: any = {
          clinic_id: assignment.clinicId,
          user_id: userId, status: 'active',
        };
        if (assignment.role === 'doctor' && Object.keys(assignment.availability).length > 0)
          cuPayload.availability = assignment.availability;
        if (existingCU) await this.adminService.updateClinicUser(existingCU.id!, cuPayload);
        else await this.adminService.createClinicUser(cuPayload);
      }
      const updated: AdminUserState = {
        userId, email: userPayload.email, name: userPayload.name, specialization: userPayload.specialization,
        global_roles: [...this.userForm.global_roles], status: this.userForm.status,
        assignments: this.userForm.assignments.map(a => ({
          ...a, clinicName: this.clinics.find(c => c.id === a.clinicId)?.name || a.clinicId,
          availability: this.deepCopyAvail(a.availability),
        })),
      };
      const idx = this.users.findIndex(u => u.userId === userId);
      if (idx >= 0) this.users[idx] = updated; else this.users.push(updated);
      this.updateUserStats();
      this.showUserForm = false; this.editingUser = null;
      this.showToast(this.editingUser ? 'User updated' : 'User created successfully');
    } catch (e: any) { this.showToast('Failed to save user: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  async deleteUser(user: AdminUserState): Promise<void> {
    const ok = await this.showConfirmDialog('Delete User', `Delete "${user.name}"?`);
    if (!ok) return;
    this.isSaving = true;
    try {
      if (!user.userId) return;
      const allCU = await this.adminService.getClinicUsers(this.subscription!.id);
      for (const cu of allCU.filter(cu => cu.user_id === user.userId)) await this.adminService.deleteClinicUser(cu.id!);
      await this.adminService.deleteUser(user.userId);
      this.users = this.users.filter(u => u.userId !== user.userId);
      this.updateUserStats();
      this.showToast('User deleted');
    } catch (e: any) { this.showToast('Failed to delete user', 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  private updateUserStats(): void {
    this.stats.totalUsers = this.users.length;
    this.stats.doctors = this.users.filter(u => u.assignments.some(a => a.role === 'doctor')).length;
    this.stats.receptionists = this.users.filter(u => u.assignments.some(a => a.role === 'receptionist')).length;
  }

  getUserRoleTag(user: AdminUserState): string {
    const roles = [...new Set(user.assignments.map(a => a.role))];
    return roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' · ');
  }

  // ── Confirm Dialog ────────────────────────────────────────────────────────
  showConfirmDialog(title: string, message: string): Promise<boolean> {
    this.confirmTitle = title; this.confirmMessage = message;
    this.confirmVisible = true; this.cdr.detectChanges();
    return new Promise(resolve => { this.confirmResolve = resolve; });
  }
  onConfirmYes() { this.confirmVisible = false; this.confirmResolve?.(true); this.confirmResolve = null; }
  onConfirmNo()  { this.confirmVisible = false; this.confirmResolve?.(false); this.confirmResolve = null; }

  // ── Toast ─────────────────────────────────────────────────────────────────
  showToast(msg: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage = msg; this.toastType = type;
    this.toastVisible = true; this.cdr.detectChanges();
    this.toastTimer = setTimeout(() => { this.toastVisible = false; this.cdr.detectChanges(); }, 3500);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private emptyClinicForm(): AdminClinicState {
    return { id: '', name: '', address: '', phone: '', email: '', subscription_id: '', weekdays: [], timings: [{ label: 'FH', start: '09:00', end: '14:00' }] };
  }
  private emptyUserForm(): AdminUserState {
    return { email: '', name: '', specialization: '', global_roles: ['doctor'], status: 'active', assignments: [] };
  }
  private deepCopyAvail(a: ClinicUserAvailability): ClinicUserAvailability {
    const copy: ClinicUserAvailability = {};
    for (const day of Object.keys(a)) copy[day] = [...(a[day] || [])];
    return copy;
  }
}
