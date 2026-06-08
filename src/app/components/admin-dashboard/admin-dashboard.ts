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

/** Represents a booking from another clinic (loaded from DB) that isn't in the current form. */
export interface ExternalBooking {
  clinicId: string;
  clinicName: string;
  availability: ClinicUserAvailability;
  timings: TimingBlock[];
}

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

  /**
   * Bookings loaded from the DB for the current user that are NOT represented
   * as assignments in the form. Used to disable availability checkboxes.
   */
  externalBookings: ExternalBooking[] = [];

  /**
   * Clinic IDs that were in the form when it was opened.
   * On save, only delete clinic_user records whose clinic ID is in this set
   * but NOT in the current form — i.e. the user explicitly removed them.
   */
  private originalFormClinicIds = new Set<string>();

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

  /** True when the clinic count has reached or exceeded the plan limit */
  get clinicLimitReached(): boolean {
    const max = this.subscription?.plan?.limits?.max_clinics ?? 0;
    return max > 0 && this.stats.clinics >= max;
  }

  /** True when the doctor count has reached or exceeded the plan limit */
  get doctorLimitReached(): boolean {
    const max = this.subscription?.plan?.limits?.max_doctors ?? 0;
    return max > 0 && this.stats.doctors >= max;
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
    console.log('[AdminDashboard] ngOnInit — waiting for authReady$');
    await firstValueFrom(this.authService.authReady$.pipe(filter(r => r)));
    this.adminName = this.authService.currentUserValue?.name || 'Admin';
    this.adminEmail = this.authService.currentUserValue?.email || '';
    console.log('[AdminDashboard] Auth ready. email=', this.adminEmail, 'name=', this.adminName);

    try {
      await this.loadSubscription();
      console.log('[AdminDashboard] loadSubscription done. subscription=', this.subscription ? this.subscription.id : null);
      if (this.subscription) {
        await Promise.all([this.loadClinics(), this.loadUsers()]);
        console.log('[AdminDashboard] Clinics:', this.clinics.length, 'Users:', this.users.length);
      } else {
        console.warn('[AdminDashboard] No subscription found — dashboard will show "No Subscription" state');
      }
    } catch (initErr) {
      console.error('[AdminDashboard] Unexpected error during init:', initErr);
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
      console.log('[AdminDashboard] loadSubscription — querying users by email:', email);
      const userDocs = await this.api.runQuery('', {
        collectionId: 'users',
        filters: [{ field: 'email', op: '==', value: email }],
      });
      console.log('[AdminDashboard] User query returned', userDocs.length, 'docs');

      // If direct query fails, try client-side fallback (handles invisible chars in email field)
      let matchedDoc = userDocs.length > 0 ? userDocs[0] : null;
      if (!matchedDoc) {
        console.warn('[AdminDashboard] Direct email query returned 0 — trying client-side fallback');
        const allUsers = await this.api.listDocuments('users', 300);
        matchedDoc = allUsers.find(d => {
          for (const key of Object.keys(d.data)) {
            if (typeof d.data[key] !== 'string') continue;
            const cleanVal = d.data[key].replace(/[^\x20-\x7E]/g, '').trim().toLowerCase();
            if (cleanVal === email) return true;
          }
          return false;
        }) || null;
        if (matchedDoc) {
          console.log('[AdminDashboard] Found user via fallback:', matchedDoc.id);
        } else {
          console.warn('[AdminDashboard] User not found even with fallback — no subscription to load');
          return;
        }
      }

      const userDoc = matchedDoc;
      this.userDocId = userDoc.id;
      let subscriptionId: string = userDoc.data['subscription_id'] || '';
      console.log('[AdminDashboard] userDocId=', this.userDocId, 'subscription_id=', subscriptionId);

      // Fallback: if the user doc doesn't have subscription_id,
      // search the subscriptions collection for this owner's email
      if (!subscriptionId) {
        console.log('[AdminDashboard] No subscription_id on user doc — trying subscriptions query by owner_email');
        try {
          const subDocs = await this.api.runQuery('', {
            collectionId: 'subscriptions',
            filters: [{ field: 'owner_email', op: '==', value: email }],
          });
          if (subDocs.length > 0) {
            subscriptionId = subDocs[0].id;
            console.log('[AdminDashboard] Found subscription via owner_email:', subscriptionId);
            // Also update the user doc so this lookup isn't needed next time
            await this.api.updateDocument('users', this.userDocId, { subscription_id: subscriptionId });
          } else {
            console.warn('[AdminDashboard] No subscriptions found for owner_email:', email);
          }
        } catch (fallbackErr) {
          console.warn('[AdminDashboard] Fallback subscription lookup failed:', fallbackErr);
        }
      }

      this.assignedSubscriptionId = subscriptionId;
      if (!subscriptionId) {
        console.warn('[AdminDashboard] No subscription_id resolved — nothing to load');
        return;
      }

      console.log('[AdminDashboard] Fetching subscription document:', subscriptionId);
      const subDoc = await this.api.getDocument('subscriptions', subscriptionId);
      if (!subDoc) {
        console.warn('[AdminDashboard] Subscription document not found:', subscriptionId);
        return;
      }

      console.log('[AdminDashboard] Subscription doc loaded:', subDoc.id, subDoc.data);
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
            console.log('[AdminDashboard] Plan doc data:', planDoc?.data);
            if (planDoc?.data) {
              // Handle potential field name variations/typos
              const maxClinics = planDoc.data['max_clinics'] ?? planDoc.data['max_clinincs'] ?? 0;
              const maxDoctors = planDoc.data['max_doctors'] ?? 0;
              if (maxClinics || maxDoctors) {
                this.subscription.plan.limits = {
                  max_clinics: maxClinics,
                  max_doctors: maxDoctors,
                  max_appointments_per_day: 0,
                };
              }
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
    } catch (e: any) {
      console.error('[AdminDashboard] loadSubscription error:', e);
      this.showToast('Failed to load subscription', 'error');
    }
  }

  private async loadClinics(): Promise<void> {
    if (!this.subscription) return;
    try {
      console.log('[AdminDashboard] loadClinics for subscription:', this.subscription.id);
      const raw = await this.adminService.getClinicsForSubscription(this.subscription.id);
      console.log('[AdminDashboard] Clinics query returned:', raw.length);

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
      console.log('[AdminDashboard] Final clinics loaded:', this.clinics.length);
    } catch (e: any) {
      console.error('[AdminDashboard] loadClinics error:', e);
      this.showToast('Failed to load clinics', 'error');
    }
  }

  private async loadUsers(): Promise<void> {
    if (!this.subscription) return;
    try {
      console.log('[AdminDashboard] loadUsers for subscription:', this.subscription.id);
      const allCU = await this.adminService.getClinicUsers(this.subscription.id);
      console.log('[AdminDashboard] clinic_users returned:', allCU.length);

      const userIds = [...new Set(allCU.map(cu => cu.user_id).filter(Boolean))];
      console.log('[AdminDashboard] Unique user IDs to load:', userIds);
      this.users = [];
      for (const userId of userIds) {
        const userDoc = await this.adminService.getUserById(userId);
        if (!userDoc) { console.warn('[AdminDashboard] User not found:', userId); continue; }
        // Derive role per-assignment from the clinic_user record, with fallback to global_roles
        const globalRoles = userDoc.global_roles || [];
        const fallbackRole: 'doctor' | 'receptionist' = globalRoles.includes('doctor') ? 'doctor' : 'receptionist';
        const assignments: UserClinicAssignment[] = allCU.filter(cu => cu.user_id === userId).map(cu => {
          const clinic = this.clinics.find(c => c.id === cu.clinic_id);
          const cuRole = (cu as any).role as string | undefined;
          const role: 'doctor' | 'receptionist' = (cuRole === 'doctor' || cuRole === 'receptionist') ? cuRole : fallbackRole;
          return {
            clinicUserId: cu.id, clinicId: cu.clinic_id, clinicName: clinic?.name || cu.clinic_id,
            role,
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
      console.log('[AdminDashboard] Final users loaded:', this.users.length, 'doctors:', this.stats.doctors, 'receptionists:', this.stats.receptionists);
    } catch (e: any) {
      console.error('[AdminDashboard] loadUsers error:', e);
      this.showToast('Failed to load users', 'error');
    }
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
    if (this.clinicLimitReached) {
      const max = this.subscription?.plan?.limits?.max_clinics ?? 0;
      this.showToast(`Clinic limit reached (${this.stats.clinics}/${max}). Upgrade your plan to add more.`, 'error');
      return;
    }
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
    // Block creating a new clinic if the limit is reached (edits are always allowed)
    if (!this.editingClinic && this.clinicLimitReached) {
      const max = this.subscription?.plan?.limits?.max_clinics ?? 0;
      this.showToast(`Clinic limit reached (${this.stats.clinics}/${max}). Upgrade your plan to add more.`, 'error');
      return;
    }
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
        const newId = await this.adminService.computeNextClinicId();
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
    const idx = this.clinicForm.timings.indexOf(t);
    // Cannot start after own end minus 15 min
    const maxVal = this.timeToMinutes(t.end) - 15;
    // Cannot start before the previous shift ends
    const minVal = idx > 0 ? this.timeToMinutes(this.clinicForm.timings[idx - 1].end) : 0;
    t.start = this.minutesToTime(Math.max(minVal, Math.min(val, maxVal)));
    this.cdr.detectChanges();
  }
  onEndSliderChange(t: TimingBlock, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    const idx = this.clinicForm.timings.indexOf(t);
    // Cannot end before own start plus 15 min
    const minVal = this.timeToMinutes(t.start) + 15;
    // Cannot end after the next shift starts
    const maxVal = idx < this.clinicForm.timings.length - 1
      ? this.timeToMinutes(this.clinicForm.timings[idx + 1].start)
      : 1440;
    t.end = this.minutesToTime(Math.min(maxVal, Math.max(val, minVal)));
    this.cdr.detectChanges();
  }

  // ── User CRUD ─────────────────────────────────────────────────────────────
  openNewUserForm(): void {
    this.userForm = this.emptyUserForm();
    this.externalBookings = [];
    if (this.clinics.length) {
      const c = this.clinics[0];
      this.userForm.assignments.push({ clinicId: c.id, clinicName: c.name, role: 'receptionist', availability: {} });
    }
    // Empty for new users — never delete existing DB assignments via "+ Add Staff"
    this.originalFormClinicIds = new Set();
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
    this.externalBookings = [];
    // Remember which clinics were in the form at open time
    this.originalFormClinicIds = new Set(this.userForm.assignments.map(a => a.clinicId));
    this.showUserForm = true;
    this.cdr.detectChanges();
    // Load external bookings from DB in the background
    if (user.userId) this.loadExternalBookings(user.userId);
  }

  cancelUserForm(): void {
    this.showUserForm = false;
    this.editingUser = null;
    this.externalBookings = [];
    this.cdr.detectChanges();
  }

  /**
   * Called when the email field loses focus in the new-user form.
   * Looks up whether this email belongs to an existing user and,
   * if so, loads their existing clinic bookings so the availability
   * checkboxes can be disabled for conflicting time slots.
   */
  async onUserEmailBlur(): Promise<void> {
    // Only for new user forms; editing already loads external bookings
    if (this.editingUser) return;
    const email = this.userForm.email.trim().toLowerCase();
    if (!email) { this.externalBookings = []; return; }

    try {
      const existing = await this.adminService.getUserByEmail(email, this.subscription!.id);
      if (existing?.id) {
        await this.loadExternalBookings(existing.id);
      } else {
        this.externalBookings = [];
        this.cdr.detectChanges();
      }
    } catch {
      this.externalBookings = [];
    }
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

    // Get the time range of the current block in the current clinic
    const currentClinic = this.clinics.find(c => c.id === currentAssignment.clinicId);
    if (!currentClinic) return false;
    const currentTiming = currentClinic.timings.find(t => t.label === block);
    if (!currentTiming) return false;
    const curStart = this.timeToMinutes(currentTiming.start);
    const curEnd = this.timeToMinutes(currentTiming.end);

    // 1. Check all OTHER assignments in the form for time overlap on the same day
    const formConflict = this.userForm.assignments.some(a => {
      if (a === currentAssignment || a.role !== 'doctor') return false;
      const bookedBlocks = a.availability[day] || [];
      if (bookedBlocks.length === 0) return false;

      const otherClinic = this.clinics.find(c => c.id === a.clinicId);
      if (!otherClinic) return false;

      return bookedBlocks.some(otherBlock => {
        const otherTiming = otherClinic.timings.find(t => t.label === otherBlock);
        if (!otherTiming) return false;
        const otherStart = this.timeToMinutes(otherTiming.start);
        const otherEnd = this.timeToMinutes(otherTiming.end);
        return curStart < otherEnd && otherStart < curEnd;
      });
    });
    if (formConflict) return true;

    // 2. Check external bookings (from DB, not in the current form)
    return this.externalBookings.some(ext => {
      const bookedBlocks = ext.availability[day] || [];
      if (bookedBlocks.length === 0) return false;

      return bookedBlocks.some(otherBlock => {
        const otherTiming = ext.timings.find(t => t.label === otherBlock);
        if (!otherTiming) return false;
        const otherStart = this.timeToMinutes(otherTiming.start);
        const otherEnd = this.timeToMinutes(otherTiming.end);
        return curStart < otherEnd && otherStart < curEnd;
      });
    });
  }

  /**
   * Returns a tooltip describing which clinic holds the conflicting booking.
   * Returns empty string if no conflict exists.
   */
  getBlockConflictTooltip(currentAssignment: UserClinicAssignment, day: string, block: string): string {
    if (currentAssignment.role !== 'doctor') return '';

    const currentClinic = this.clinics.find(c => c.id === currentAssignment.clinicId);
    if (!currentClinic) return '';
    const currentTiming = currentClinic.timings.find(t => t.label === block);
    if (!currentTiming) return '';
    const curStart = this.timeToMinutes(currentTiming.start);
    const curEnd = this.timeToMinutes(currentTiming.end);

    // Check form assignments
    for (const a of this.userForm.assignments) {
      if (a === currentAssignment || a.role !== 'doctor') continue;
      const bookedBlocks = a.availability[day] || [];
      const otherClinic = this.clinics.find(c => c.id === a.clinicId);
      if (!otherClinic) continue;

      for (const otherBlock of bookedBlocks) {
        const otherTiming = otherClinic.timings.find(t => t.label === otherBlock);
        if (!otherTiming) continue;
        const otherStart = this.timeToMinutes(otherTiming.start);
        const otherEnd = this.timeToMinutes(otherTiming.end);
        if (curStart < otherEnd && otherStart < curEnd) {
          return `Already assigned to "${otherClinic.name}" (${otherBlock} ${otherTiming.start}–${otherTiming.end})`;
        }
      }
    }

    // Check external bookings
    for (const ext of this.externalBookings) {
      const bookedBlocks = ext.availability[day] || [];
      for (const otherBlock of bookedBlocks) {
        const otherTiming = ext.timings.find(t => t.label === otherBlock);
        if (!otherTiming) continue;
        const otherStart = this.timeToMinutes(otherTiming.start);
        const otherEnd = this.timeToMinutes(otherTiming.end);
        if (curStart < otherEnd && otherStart < curEnd) {
          return `Already assigned to "${ext.clinicName}" (${otherBlock} ${otherTiming.start}–${otherTiming.end})`;
        }
      }
    }

    return '';
  }

  async saveUser(): Promise<void> {
    if (!this.userForm.email.trim() || !this.userForm.name.trim()) {
      this.showToast('Email and name are required', 'error'); return;
    }

    // Doctor limit check — only block when adding a NEW doctor (edits are always allowed)
    const hasDocRole = this.userForm.assignments.some(a => a.role === 'doctor');
    if (!this.editingUser && hasDocRole && this.doctorLimitReached) {
      const max = this.subscription?.plan?.limits?.max_doctors ?? 0;
      this.showToast(`Doctor limit reached (${this.stats.doctors}/${max}). Upgrade your plan to add more.`, 'error');
      return;
    }

    // Intra-form conflict check (time-range overlap between clinics)
    const doctorAssignments = this.userForm.assignments.filter(a => a.role === 'doctor');
    for (let i = 0; i < doctorAssignments.length; i++) {
      for (let j = i + 1; j < doctorAssignments.length; j++) {
        const a1 = doctorAssignments[i];
        const a2 = doctorAssignments[j];
        const c1 = this.clinics.find(c => c.id === a1.clinicId);
        const c2 = this.clinics.find(c => c.id === a2.clinicId);
        if (!c1 || !c2) continue;
        const avail1 = a1.availability || {};
        const avail2 = a2.availability || {};
        const allDays = new Set([...Object.keys(avail1), ...Object.keys(avail2)]);
        for (const day of allDays) {
          const blocks1 = avail1[day] || [];
          const blocks2 = avail2[day] || [];
          for (const b1 of blocks1) {
            const t1 = c1.timings.find(t => t.label === b1);
            if (!t1) continue;
            const s1 = this.timeToMinutes(t1.start);
            const e1 = this.timeToMinutes(t1.end);
            for (const b2 of blocks2) {
              const t2 = c2.timings.find(t => t.label === b2);
              if (!t2) continue;
              const s2 = this.timeToMinutes(t2.start);
              const e2 = this.timeToMinutes(t2.end);
              if (s1 < e2 && s2 < e1) {
                const dayLabel = this.weekdayLabels[day] || day;
                this.showToast(
                  `${dayLabel}: "${c1.name}" (${b1} ${t1.start}–${t1.end}) and "${c2.name}" (${b2} ${t2.start}–${t2.end}) overlap — a doctor cannot be at two clinics simultaneously.`,
                  'error'
                );
                return;
              }
            }
          }
        }
      }
    }

    this.isSaving = true;
    try {
      let userId = this.userForm.userId;
      // Derive global_roles from the per-assignment roles
      const assignmentRoles = new Set(this.userForm.assignments.map(a => a.role));
      const derivedGlobalRoles: string[] = [];
      if (assignmentRoles.has('doctor')) derivedGlobalRoles.push('doctor');
      if (assignmentRoles.has('receptionist')) derivedGlobalRoles.push('receptionist');
      if (derivedGlobalRoles.length === 0) derivedGlobalRoles.push('receptionist');

      const userPayload: any = {
        email: this.userForm.email.trim().toLowerCase(),
        name: this.userForm.name.trim(),
        specialization: this.userForm.specialization?.trim() || '',
        global_roles: derivedGlobalRoles,
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
      // Only delete clinic_user records that were originally in the form but
      // were explicitly removed by the admin. Do NOT delete records for clinics
      // that were never part of this editing session (preserves other clinics).
      const existingCUs = await this.adminService.getClinicUsers(this.subscription!.id);
      const userCUs = existingCUs.filter(cu => cu.user_id === userId);
      const newClinicIds = new Set(this.userForm.assignments.map(a => a.clinicId));
      for (const cu of userCUs) {
        // Only delete if the clinic was originally in the form AND is now removed
        if (this.originalFormClinicIds.has(cu.clinic_id) && !newClinicIds.has(cu.clinic_id)) {
          await this.adminService.deleteClinicUser(cu.id!);
        }
      }
      for (const assignment of this.userForm.assignments) {
        const existingCU = userCUs.find(cu => cu.clinic_id === assignment.clinicId);
        const cuPayload: any = {
          clinic_id: assignment.clinicId,
          user_id: userId, status: 'active',
          role: assignment.role,
        };
        if (assignment.role === 'doctor' && Object.keys(assignment.availability).length > 0)
          cuPayload.availability = assignment.availability;
        if (existingCU) await this.adminService.updateClinicUser(existingCU.id!, cuPayload);
        else await this.adminService.createClinicUser(cuPayload);
      }
      // Rebuild local state from DB to capture ALL assignments (including external ones)
      const freshCUs = await this.adminService.getClinicUsers(this.subscription!.id);
      const freshUserCUs = freshCUs.filter(cu => cu.user_id === userId);
      const allAssignments: UserClinicAssignment[] = freshUserCUs.map(cu => {
        const clinic = this.clinics.find(c => c.id === cu.clinic_id);
        const cuRole = (cu as any).role as string | undefined;
        const role: 'doctor' | 'receptionist' = (cuRole === 'doctor' || cuRole === 'receptionist') ? cuRole : 'receptionist';
        return {
          clinicUserId: cu.id, clinicId: cu.clinic_id,
          clinicName: clinic?.name || cu.clinic_id,
          role,
          availability: this.deepCopyAvail((cu as any).availability || {}),
        };
      });
      const updated: AdminUserState = {
        userId, email: userPayload.email, name: userPayload.name, specialization: userPayload.specialization,
        global_roles: [...derivedGlobalRoles], status: this.userForm.status,
        assignments: allAssignments,
      };
      const idx = this.users.findIndex(u => u.userId === userId);
      if (idx >= 0) this.users[idx] = updated; else this.users.push(updated);
      this.updateUserStats();
      this.showUserForm = false; this.editingUser = null;
      this.externalBookings = [];
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

  /**
   * Load clinic_user records from the DB for this user that are NOT currently
   * represented by assignments in the form. This covers clinics from the same
   * subscription that the admin hasn't added to the form.
   */
  private async loadExternalBookings(userId: string): Promise<void> {
    try {
      const allCuDocs = await this.adminService.getAllClinicUsersForUser(userId);
      const formClinicIds = new Set(this.userForm.assignments.map(a => a.clinicId));

      const externals: ExternalBooking[] = [];
      for (const cu of allCuDocs) {
        if (formClinicIds.has(cu.clinic_id)) continue; // already in form
        const avail: ClinicUserAvailability = (cu as any).availability || {};
        if (Object.keys(avail).length === 0) continue; // no availability data

        // Resolve clinic info for timings
        let clinic = this.clinics.find(c => c.id === cu.clinic_id);
        let timings: TimingBlock[] = [];
        let clinicName = cu.clinic_id;

        if (clinic) {
          timings = clinic.timings;
          clinicName = clinic.name;
        } else {
          // Clinic from another subscription — try to load its schedule
          try {
            const schedule = await this.adminService.getClinicSchedule(cu.clinic_id);
            if (schedule?.timings) timings = schedule.timings;
          } catch { /* ignore */ }
          clinicName = cu.clinic_id; // Use ID as fallback name
        }

        if (timings.length > 0) {
          externals.push({ clinicId: cu.clinic_id, clinicName, availability: avail, timings });
        }
      }

      this.externalBookings = externals;
      this.cdr.detectChanges();
    } catch (err) {
      console.warn('[AdminDashboard] Failed to load external bookings:', err);
    }
  }
}
