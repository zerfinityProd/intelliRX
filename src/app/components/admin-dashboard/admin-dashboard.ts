// src/app/components/admin-dashboard/admin-dashboard.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { filter, firstValueFrom } from 'rxjs';
import { AuthenticationService } from '../../services/authenticationService';
import { AdminService } from '../../services/adminService';
import { SubscriptionRepository } from '../../repositories/interfaces/subscription.repository';
import { PlanRepository } from '../../repositories/interfaces/plan.repository';
import { ConfigService } from '../../services/configService';
import { Subscription } from '../../models/subscription.model';
import { ClinicUserAvailability } from '../../models/clinic-user.model';
import { MultiClinicConfig, DEFAULT_MULTI_CLINIC_CONFIG } from '../../config/userSettings';
import { NavbarComponent } from '../navbar/navbar';
import { ClinicContextService } from '../../services/clinicContextService';
import { SpecializationService } from '../../services/specializationService';

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
  clinicUserId?: string; clinicId: string; clinicName: string; clinicAddress?: string;
  role: 'doctor' | 'receptionist'; availability: ClinicUserAvailability;
  /** Per-block time overrides (applies to all days): key = block label, value = { start, end } */
  timingOverrides?: Record<string, { start: string; end: string }>;
  /**
   * Per-day per-block time overrides.
   * Key 1 = weekday code (e.g. 'M'), Key 2 = block label (e.g. 'FH'),
   * Value = { start, end } — overrides timingOverrides > clinic default for that specific day.
   */
  dayBlockOverrides?: Record<string, Record<string, { start: string; end: string }>>;
}

export interface AdminUserState {
  userId?: string; email: string; name: string; specialization?: string;
  global_roles: string[]; status: 'active' | 'inactive';
  assignments: UserClinicAssignment[];
}

type ActiveSection = 'clinics' | 'users' | 'config' | null;

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthenticationService);
  private adminService = inject(AdminService);
  private subscriptionRepo = inject(SubscriptionRepository);
  private planRepo = inject(PlanRepository);
  private configService = inject(ConfigService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private cdr = inject(ChangeDetectorRef);
  private clinicContext = inject(ClinicContextService);
  private specializationService = inject(SpecializationService);

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

  // ── Configuration (multi-clinic settings + slot interval) ──────────────────
  configSettings: MultiClinicConfig = { ...DEFAULT_MULTI_CLINIC_CONFIG };
  /** Subscription-wide default slot duration in minutes */
  slotMinutes = 30;
  /** Per-clinic overrides: clinicId → minutes (null = use subscription default) */
  clinicSlotMinutes = new Map<string, number | null>();
  readonly slotPresets = [5, 10, 15, 20, 30, 45, 60];
  configLoading = false;
  configSaving = false;

  /**
   * Mirrors configurations/system → allow_same_clinic_name.
   * When false, duplicate clinic names are blocked across ALL subscriptions.
   */
  allowSameClinicName = true;


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

  /** List of specialization names fetched from `specializations/field` */
  specializationNames: string[] = [];

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
  private originalFormClinicIds = new Set<string>(); // tracks 'clinicId::role' pairs

  /** Per-cell time validation errors. Key = 'clinicId::role::day::blockLabel' */
  timeRangeErrors = new Map<string, string>();

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

  // ── Draft persistence (survives page refresh) ─────────────────────────────
  private readonly DRAFT_KEY = 'irx_admin_user_form_draft';
  private draftInterval: any;
  /** True when the page is about to refresh (vs navigate away) */
  private isPageRefresh = false;
  private beforeUnloadHandler = () => { this.isPageRefresh = true; };

  // ── Getters ───────────────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }

  get subscriptionPlanLabel(): string {
    return (this.subscription?.plan?.name || 'unknown').toUpperCase();
  }

  /**
   * Returns the number of whole days until the subscription expires.
   * Negative = already expired. Null = no valid_until set.
   */
  get daysUntilExpiry(): number | null {
    const v = this.subscription?.valid_until;
    if (!v) return null;
    const msLeft = new Date(v).getTime() - Date.now();
    return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  }

  /** True when the user form has at least one clinic assignment with role = 'doctor'. */
  get userFormHasDoctorRole(): boolean {
    return this.userForm.assignments?.some(a => a.role === 'doctor') ?? false;
  }


  /** 'expired' | 'critical' (<=7d) | 'warning' (<=30d) | 'ok' | 'none' (no date set) */
  get expiryUrgency(): 'expired' | 'critical' | 'warning' | 'ok' | 'none' {
    const d = this.daysUntilExpiry;
    if (d === null) return 'none';
    if (d <= 0) return 'expired';
    if (d <= 7) return 'critical';
    if (d <= 30) return 'warning';
    return 'ok';
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

  /** True when the receptionist count has reached or exceeded the plan limit */
  get receptionistLimitReached(): boolean {
    const max = this.subscription?.plan?.limits?.max_receptionists ?? 0;
    return max > 0 && this.stats.receptionists >= max;
  }

  /** True when no clinics have been created yet — staff cannot be added without at least one clinic. */
  get hasNoClinics(): boolean {
    return this.stats.clinics === 0;
  }

  get filteredClinics(): AdminClinicState[] {
    if (!this.clinicSearch.trim()) return this.clinics;
    const q = this.clinicSearch.toLowerCase();
    return this.clinics.filter(c => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  }

  get filteredUsers(): AdminUserState[] {
    // Exclude admin-only users — they are implicit and don't belong in the staff list.
    // A user is shown only if they have at least one doctor/receptionist assignment
    // or a non-admin role in global_roles.
    const staff = this.users.filter(u => {
      const hasClinicAssignment = u.assignments.some(
        a => a.role === 'doctor' || a.role === 'receptionist'
      );
      const hasStaffRole = (u.global_roles || []).some(
        r => r === 'doctor' || r === 'receptionist'
      );
      return hasClinicAssignment || hasStaffRole;
    });
    if (!this.userSearch.trim()) return staff;
    const q = this.userSearch.toLowerCase();
    return staff.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    console.debug('[AdminDashboard] ngOnInit — waiting for authReady$');
    await firstValueFrom(this.authService.authReady$.pipe(filter(r => r)));
    this.adminName = this.authService.currentUserValue?.name || 'Admin';
    this.adminEmail = this.authService.currentUserValue?.email || '';
    console.debug('[AdminDashboard] Auth ready. email=', this.adminEmail, 'name=', this.adminName);

    // If no email resolved from Firebase Auth, the auth token is invalid
    // (e.g. IndexedDB corruption). Redirect to login immediately.
    if (!this.adminEmail) {
      console.warn('[AdminDashboard] No email from auth — likely stale/corrupted auth token. Redirecting to login.');
      this.router.navigate(['/app/login']);
      return;
    }

    try {
      await this.loadSubscription();
      console.debug('[AdminDashboard] loadSubscription done. subscription=', this.subscription ? this.subscription.id : null);
      if (this.subscription) {
        await Promise.all([
          this.loadClinics(),
          this.loadUsers(),
          this.loadConfig(),
          this.specializationService.getSpecializationNames().then(names => {
            this.specializationNames = names;
          }),
          // Load system-level config flags (e.g. allow_same_clinic_name)
          this.configService.getSystemConfig().then(sys => {
            this.allowSameClinicName = (sys['allow_same_clinic_name'] ?? 'yes') === 'yes';
          }).catch(() => { this.allowSameClinicName = true; }),
        ]);
        console.debug('[AdminDashboard] Clinics:', this.clinics.length, 'Users:', this.users.length);
      } else {
        console.warn('[AdminDashboard] No subscription found — dashboard will show "No Subscription" state');
      }
    } catch (initErr: any) {
      console.error('[AdminDashboard] Unexpected error during init:', initErr);
      // If the error is a Firestore permission error (PERMISSION_DENIED / 403),
      // the auth token is likely expired or corrupted. Redirect to login.
      const isPermissionError = initErr?.code === 'permission-denied'
        || initErr?.message?.includes('403')
        || initErr?.message?.includes('PERMISSION_DENIED');
      if (isPermissionError) {
        console.warn('[AdminDashboard] Firestore permission error — redirecting to login to refresh auth token.');
        this.router.navigate(['/app/login']);
        return;
      }
    }
    this.isLoading = false;
    this.cdr.detectChanges();

    // Restore section from URL query param after data is loaded
    const sectionParam = this.route.snapshot.queryParamMap.get('section') as ActiveSection;
    if (sectionParam === 'clinics' || sectionParam === 'users') {
      this.activeSection = sectionParam;
      this.cdr.detectChanges();
    }

    // Restore user form draft if one was saved before the refresh
    this.restoreUserFormDraft();
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.stopDraftSave();
    // If the user navigated away intentionally (not a refresh), clear the draft
    // so stale data doesn't reappear when they come back to this route.
    if (!this.isPageRefresh) {
      this.clearDraft();
    }
  }

  // ── Draft helpers ──────────────────────────────────────────────────────────
  private saveDraft(): void {
    if (!this.showUserForm) return;
    try {
      sessionStorage.setItem(this.DRAFT_KEY, JSON.stringify({
        userForm: this.userForm,
        editingUserId: this.editingUser?.userId ?? null,
      }));
    } catch { /* storage full — ignore */ }
  }

  private clearDraft(): void {
    sessionStorage.removeItem(this.DRAFT_KEY);
    this.stopDraftSave();
  }

  private startDraftSave(): void {
    this.stopDraftSave();
    this.saveDraft(); // immediate save
    this.draftInterval = setInterval(() => this.saveDraft(), 1500);
  }

  private stopDraftSave(): void {
    if (this.draftInterval) { clearInterval(this.draftInterval); this.draftInterval = null; }
  }

  private restoreUserFormDraft(): void {
    const raw = sessionStorage.getItem(this.DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (!draft?.userForm) return;
      this.userForm = draft.userForm;
      if (draft.editingUserId) {
        this.editingUser = this.users.find(u => u.userId === draft.editingUserId) ?? null;
        if (this.editingUser) {
          this.originalFormClinicIds = new Set(
            this.userForm.assignments.map((a: any) => `${a.clinicId}::${a.role}`)
          );
        }
      } else {
        this.editingUser = null;
        this.originalFormClinicIds = new Set();
      }
      this.showUserForm = true;
      this.activeSection = 'users'; // make sure the section is open
      this.startDraftSave();
      this.cdr.detectChanges();
    } catch { sessionStorage.removeItem(this.DRAFT_KEY); }
  }

  // Known plan defaults — used when plan.limits is not embedded in the
  // subscription doc AND the plans collection can't be read (security rules).
  private readonly PLAN_DEFAULTS: Record<string, { max_clinics: number; max_doctors: number; max_receptionists: number }> = {
    starter: { max_clinics: 3, max_doctors: 3,  max_receptionists: 3  },
    basic:   { max_clinics: 5, max_doctors: 5,  max_receptionists: 5  },
    demo:    { max_clinics: 2, max_doctors: 2,  max_receptionists: 2  },
    pro:     { max_clinics: 5, max_doctors: 5,  max_receptionists: 5  },
    premium: { max_clinics: 10, max_doctors: 20, max_receptionists: 20 },
  };

  private async loadSubscription(): Promise<void> {
    try {
      const email = this.adminEmail.toLowerCase().trim();
      console.debug('[AdminDashboard] loadSubscription — querying users by email:', email);
      let userDoc = await this.adminService.getUserByEmail(email);

      // If direct query fails, try client-side fallback
      if (!userDoc) {
        console.warn('[AdminDashboard] Direct email query returned 0 — trying client-side fallback');
        const allUsers = await this.adminService.getAllUsers(300);
        userDoc = allUsers.find((d: any) => {
          for (const key of Object.keys(d)) {
            if (typeof (d as any)[key] !== 'string') continue;
            const cleanVal = (d as any)[key].replace(/[^\x20-\x7E]/g, '').trim().toLowerCase();
            if (cleanVal === email) return true;
          }
          return false;
        }) ?? null;
        if (userDoc) {
          console.debug('[AdminDashboard] Found user via fallback:', (userDoc as any).id);
        } else {
          console.warn('[AdminDashboard] User not found even with fallback — no subscription to load');
          return;
        }
      }

      this.userDocId = (userDoc as any).id;
      let subscriptionId: string = (userDoc as any).subscription_id || '';
      console.debug('[AdminDashboard] userDocId=', this.userDocId, 'subscription_id=', subscriptionId);

      // Fallback 1: clinicContextService already has the subscriptionId from
      // the login flow (set by navigateByRole → ensureClinicSelected). This is
      // the cheapest lookup and works for admin-only users who have no
      // clinic_users entries and no subscription_id on their user doc.
      if (!subscriptionId) {
        const ctxSubId = this.clinicContext.getSubscriptionId();
        if (ctxSubId) {
          subscriptionId = ctxSubId;
          console.debug('[AdminDashboard] Resolved subscriptionId from ClinicContextService:', subscriptionId);
          // Persist it back to the user doc so future loads are direct
          try {
            await this.adminService.updateUser(this.userDocId, { subscription_id: subscriptionId } as any);
          } catch { /* non-critical */ }
        }
      }

      // Fallback 2: search the subscriptions collection for this owner's email.
      // Note: this may be blocked by Firestore security rules (403) for some
      // admin users — the catch handles that gracefully.
      if (!subscriptionId) {
        console.debug('[AdminDashboard] No subscription_id on user doc — trying subscriptions query by owner_email');
        try {
          const allSubs = await this.subscriptionRepo.getSubscriptions();
          const ownerSub = allSubs.find(s => (s as any)['owner_email'] === email);
          if (ownerSub) {
            subscriptionId = ownerSub.id!;
            console.debug('[AdminDashboard] Found subscription via owner_email:', subscriptionId);
            await this.adminService.updateUser(this.userDocId, { subscription_id: subscriptionId } as any);
          } else {
            console.warn('[AdminDashboard] No subscriptions found for owner_email:', email);
          }
        } catch (fallbackErr) {
          console.warn('[AdminDashboard] Fallback subscription lookup failed:', fallbackErr);
        }
      }

      this.assignedSubscriptionId = subscriptionId;

      // Push subscriptionId into ClinicContextService so the navbar's
      // subscription-expiry banner check has a subscriptionId to evaluate.
      // Admin-only users have no clinic, so clinicId stays null.
      if (subscriptionId && !this.clinicContext.getSubscriptionId()) {
        this.clinicContext.setClinicContext(null, subscriptionId);
      }

      if (!subscriptionId) {
        console.warn('[AdminDashboard] No subscription_id resolved — nothing to load');
        return;
      }

      console.debug('[AdminDashboard] Fetching subscription document:', subscriptionId);
      const sub = await this.subscriptionRepo.getSubscriptionById(subscriptionId);
      if (!sub) {
        console.warn('[AdminDashboard] Subscription document not found:', subscriptionId);
        return;
      }

      console.debug('[AdminDashboard] Subscription doc loaded:', sub.id, sub);
      // Cast to a non-null local so the compiler can track narrowing through async callbacks
      const subData = sub as (import('../../models/subscription.model').Subscription & { id: string });
      this.subscription = { ...subData, id: subData.id };

      // Normalize plan: Firestore may store it as a plain string (e.g. "starter")
      // but the model expects { name: string, limits: PlanLimits }
      const rawPlan = this.subscription!.plan as any;
      if (typeof rawPlan === 'string') {
        this.subscription!.plan = {
          name: rawPlan,
          limits: { max_clinics: 0, max_doctors: 0, max_receptionists: 0, max_appointments_per_day: 0 }
        };
      } else if (!rawPlan) {
        this.subscription!.plan = {
          name: 'basic',
          limits: { max_clinics: 0, max_doctors: 0, max_receptionists: 0, max_appointments_per_day: 0 }
        };
      }

      // Check if plan.limits is already populated with real values
      const hasLimits = this.subscription!.plan?.limits
        && (this.subscription!.plan.limits.max_clinics > 0 || this.subscription!.plan.limits.max_doctors > 0);

      if (!hasLimits) {
        const planName = (this.subscription!.plan?.name || '').toLowerCase();

        // Try fetching from the 'plans' collection first
        let resolved = false;
        if (planName) {
          try {
            const planDetails = await this.planRepo.getPlanByKey(planName);
            console.debug('[AdminDashboard] Plan doc data:', planDetails);
            if (planDetails) {
              const maxClinics = (planDetails as any)['max_clinics'] ?? (planDetails as any)['max_clinincs'] ?? 0;
              const maxDoctors = (planDetails as any)['max_doctors'] ?? 0;
              const maxReceptionists = (planDetails as any)['max_receptionists'] ?? (planDetails as any)['max_receptionist'] ?? 0;
              if (maxClinics || maxDoctors) {
                this.subscription!.plan!.limits = {
                  max_clinics: maxClinics,
                  max_doctors: maxDoctors,
                  max_receptionists: maxReceptionists,
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
          this.subscription!.plan!.limits = {
            max_clinics: defaults.max_clinics,
            max_doctors: defaults.max_doctors,
            max_receptionists: defaults.max_receptionists,
            max_appointments_per_day: 0,
          };
        }
      }

      // Ensure limits object always exists
      if (!this.subscription!.plan?.limits) {
        this.subscription!.plan!.limits = { max_clinics: 0, max_doctors: 0, max_receptionists: 0, max_appointments_per_day: 0 };
      }

      // ── Backfill valid_until if missing ─────────────────────────────────
      // Existing subscriptions created before the valid_until feature won't have
      // this field. Compute it from created_at + plan validity days and write it
      // back to Firestore so it's permanently set.
      if (!this.subscription!.valid_until) {
        try {
          const planName = this.subscription!.plan?.name || '';
          const validityDays = planName
            ? await this.configService.getPlanValidityDays(planName)
            : 30;
          const baseDate = this.subscription!.created_at
            ? new Date(this.subscription!.created_at)
            : new Date();
          const expiryDate = new Date(baseDate);
          expiryDate.setDate(expiryDate.getDate() + validityDays);
          const valid_until = expiryDate.toISOString();
          // Write back to Firestore so this doesn't repeat
          await this.subscriptionRepo.updateSubscription(this.subscription!.id, { valid_until } as any);
          this.subscription!.valid_until = valid_until;
          console.debug('[AdminDashboard] Backfilled valid_until:', valid_until, 'for plan:', planName, '(', validityDays, 'days from created_at)');
        } catch (backfillErr) {
          console.warn('[AdminDashboard] Could not backfill valid_until:', backfillErr);
        }
      }
    } catch (e: any) {
      console.error('[AdminDashboard] loadSubscription error:', e);
      this.showToast('Failed to load subscription', 'error');
    }
  }

  private async loadClinics(): Promise<void> {
    if (!this.subscription) return;
    try {
      console.debug('[AdminDashboard] loadClinics for subscription:', this.subscription.id);
      const raw = await this.adminService.getClinicsForSubscription(this.subscription.id);
      console.debug('[AdminDashboard] Clinics query returned:', raw.length);

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
      console.debug('[AdminDashboard] Final clinics loaded:', this.clinics.length);
    } catch (e: any) {
      console.error('[AdminDashboard] loadClinics error:', e);
      this.showToast('Failed to load clinics', 'error');
    }
  }

  private async loadUsers(): Promise<void> {
    if (!this.subscription) return;
    try {
      console.debug('[AdminDashboard] loadUsers for subscription:', this.subscription.id);
      const allCU = await this.adminService.getClinicUsers(this.subscription.id);
      console.debug('[AdminDashboard] clinic_users returned:', allCU.length);

      const userIds = [...new Set(allCU.map(cu => cu.user_id).filter(Boolean))];
      console.debug('[AdminDashboard] Unique user IDs to load:', userIds);
      this.users = [];
      for (const userId of userIds) {
        const userDoc = await this.adminService.getUserById(userId);
        if (!userDoc) { console.warn('[AdminDashboard] User not found:', userId); continue; }
        // Derive role per-assignment from the clinic_user record, with fallback to global_roles
        const globalRoles = userDoc.global_roles || [];
        const fallbackRole: 'doctor' | 'receptionist' = globalRoles.includes('doctor') ? 'doctor' : 'receptionist';
        // Build clinic assignments — skip entries with no clinic_id (e.g. admin-level
        // clu records created at registration time with subscription_id only).
        const assignments: UserClinicAssignment[] = allCU
          .filter(cu => cu.user_id === userId && cu.clinic_id)
          .map(cu => {
          const clinic = this.clinics.find(c => c.id === cu.clinic_id);
          const cuRole = (cu as any).role as string | undefined;
          const role: 'doctor' | 'receptionist' = (cuRole === 'doctor' || cuRole === 'receptionist') ? cuRole : fallbackRole;
          return {
            clinicUserId: cu.id, clinicId: cu.clinic_id, clinicName: clinic?.name || cu.clinic_id,
            clinicAddress: clinic?.address || '',
            role,
            availability: (cu as any).availability || {},
            timingOverrides: this.deepCopyTimingOverrides((cu as any).timingOverrides),
            dayBlockOverrides: this.deepCopyDayBlockOverrides((cu as any).dayBlockOverrides),
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
      console.debug('[AdminDashboard] Final users loaded:', this.users.length, 'doctors:', this.stats.doctors, 'receptionists:', this.stats.receptionists);
    } catch (e: any) {
      console.error('[AdminDashboard] loadUsers error:', e);
      this.showToast('Failed to load users', 'error');
    }
  }

  setSection(s: ActiveSection): void {
    this.activeSection = s;
    this.showClinicForm = false;
    this.showUserForm = false;
    // Persist section in URL so page refresh restores this view
    const url = this.location.path().split('?')[0];
    this.location.replaceState(url, s ? `section=${s}` : '');
    // Load config settings when navigating to the config panel
    if (s === 'config') { this.loadConfig(); }
    this.cdr.detectChanges();
  }

  /** Navigate to the standalone Subscription Management page */
  navigateToSubscription(): void {
    this.router.navigate(['/admin/subscription']);
  }

  clearSection(): void {
    this.activeSection = null;
    this.showClinicForm = false;
    this.showUserForm = false;
    // Remove section param from URL when returning to overview
    const url = this.location.path().split('?')[0];
    this.location.replaceState(url);
    this.cdr.detectChanges();
  }

  // ── Config helpers ────────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    if (!this.subscription) return;
    this.configLoading = true;
    this.cdr.detectChanges();
    try {
      const cfg = await this.configService.getSubscriptionConfig(this.subscription.id);
      // Multi-clinic flags
      if (cfg?.multiClinic) {
        this.configSettings = {
          share_patients_across_clinics: cfg.multiClinic.share_patients_across_clinics ?? DEFAULT_MULTI_CLINIC_CONFIG.share_patients_across_clinics,
          allow_doctor_time_clash: cfg.multiClinic.allow_doctor_time_clash ?? DEFAULT_MULTI_CLINIC_CONFIG.allow_doctor_time_clash,
        };
      } else {
        this.configSettings = { ...DEFAULT_MULTI_CLINIC_CONFIG };
      }
      // Subscription-wide default slot interval
      this.slotMinutes = cfg?.timeSlots?.slotMinutes ?? 30;

      // Per-clinic slot overrides
      this.clinicSlotMinutes.clear();
      await Promise.all(this.clinics.map(async clinic => {
        try {
          const clinicCfg = await this.configService.getClinicConfig(clinic.id, this.subscription!.id);
          const override = clinicCfg?.timeSlots?.slotMinutes ?? null;
          this.clinicSlotMinutes.set(clinic.id, override);
        } catch {
          this.clinicSlotMinutes.set(clinic.id, null);
        }
      }));
    } catch (e) {
      console.error('[AdminDashboard] loadConfig error:', e);
      this.configSettings = { ...DEFAULT_MULTI_CLINIC_CONFIG };
      this.slotMinutes = 30;
    } finally {
      this.configLoading = false;
      this.cdr.detectChanges();
    }
  }

  async saveConfig(): Promise<void> {
    if (!this.subscription) return;
    // Validate default slot minutes
    const mins = Number(this.slotMinutes);
    if (!mins || mins < 5 || mins > 120) {
      this.showToast('Default slot interval must be between 5 and 120 minutes', 'error');
      return;
    }
    this.configSaving = true;
    this.cdr.detectChanges();
    console.debug('[saveConfig] subscription.id =', this.subscription.id);
    console.debug('[saveConfig] clinics =', this.clinics.map(c => c.id));
    console.debug('[saveConfig] clinicSlotMinutes =', [...this.clinicSlotMinutes.entries()]);
    try {
      // Save subscription-level config
      const existing = await this.configService.getSubscriptionConfig(this.subscription.id);
      await this.configService.setSubscriptionConfig(this.subscription.id, {
        ...existing,
        multiClinic: { ...this.configSettings },
        timeSlots: { ...(existing?.timeSlots ?? {}), slotMinutes: mins },
      });
      console.debug('[saveConfig] Subscription config saved OK');

      // Save per-clinic slot overrides in parallel
      await Promise.all(this.clinics.map(async clinic => {
        const override = this.clinicSlotMinutes.get(clinic.id) ?? null;
        console.debug(`[saveConfig] clinic=${clinic.id} override=${override}`);
        try {
          const existingCfg = await this.configService.getClinicConfig(clinic.id, this.subscription!.id) ?? {};
          if (override !== null) {
            await this.configService.setClinicConfig(clinic.id, {
              ...existingCfg,
              timeSlots: { ...(existingCfg.timeSlots ?? {}), slotMinutes: override },
            }, this.subscription!.id);
            console.debug(`[saveConfig] clinic=${clinic.id} saved slotMinutes=${override}`);
          } else {
            // Remove clinic-level override — keep existing config but clear slotMinutes
            const { timeSlots, ...rest } = existingCfg as any;
            await this.configService.setClinicConfig(clinic.id, { ...rest }, this.subscription!.id);
            console.debug(`[saveConfig] clinic=${clinic.id} cleared slot override`);
          }
        } catch (e) {
          console.error(`[saveConfig] FAILED for clinic ${clinic.id}:`, e);
        }
      }));

      this.showToast('Configuration saved successfully', 'success');
    } catch (e) {
      console.error('[AdminDashboard] saveConfig error:', e);
      this.showToast('Failed to save configuration', 'error');
    } finally {
      this.configSaving = false;
      this.cdr.detectChanges();
    }
  }

  /** Returns the clinic-specific slot override, or null if using the subscription default. */
  getClinicSlot(clinicId: string): number | null {
    return this.clinicSlotMinutes.get(clinicId) ?? null;
  }

  /** Sets (or clears) the slot override for a specific clinic. */
  setClinicSlot(clinicId: string, minutes: number | null): void {
    if (minutes !== null) {
      const clamped = Math.min(120, Math.max(5, minutes));
      this.clinicSlotMinutes.set(clinicId, clamped);
    } else {
      this.clinicSlotMinutes.set(clinicId, null);
    }
    this.cdr.detectChanges();
  }

  /**
   * Handles the Doctor Availability & Time Clash toggle.
   * - Turning OFF  → saves immediately with no prompt.
   * - Turning ON   → shows a confirmation warning first, then saves.
   */
  async onTimeClashToggle(event: Event): Promise<void> {
    event.preventDefault(); // prevent checkbox default — we drive state manually
    if (!this.subscription) return;

    const turningOn = !this.configSettings.allow_doctor_time_clash;

    if (turningOn) {
      // Warn the user before enabling overlapping slots
      const { default: Swal } = await import('sweetalert2');
      const result = await Swal.fire({
        title: 'Allow Time-Clash?',
        html: `Enabling this will allow a doctor's availability slots to <strong>overlap across different clinics</strong>.<br><br>
               Existing conflicts will no longer be flagged. Are you sure?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, allow it',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#148D9E',
        cancelButtonColor: '#6c757d',
      });
      if (!result.isConfirmed) return; // user cancelled — leave toggle as-is
    }

    // Apply the new value
    this.configSettings = { ...this.configSettings, allow_doctor_time_clash: turningOn };
    this.cdr.detectChanges();

    // Auto-save silently
    if (!this.subscription) return;
    try {
      const existing = await this.configService.getSubscriptionConfig(this.subscription.id);
      await this.configService.setSubscriptionConfig(this.subscription.id, {
        ...existing,
        multiClinic: { ...this.configSettings },
        timeSlots: existing?.timeSlots ?? {},
      });
      this.showToast(
        turningOn ? 'Time-clash allowed across clinics' : 'Time-clash restriction enabled',
        'success'
      );
    } catch (e) {
      console.error('[AdminDashboard] onTimeClashToggle save error:', e);
      // Revert the toggle on error so UI stays consistent
      this.configSettings = { ...this.configSettings, allow_doctor_time_clash: !turningOn };
      this.showToast('Failed to save — please try again', 'error');
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** True when the staff member has doctor or admin in their global_roles */
  hasNavigableRole(user: AdminUserState): boolean {
    return user.global_roles.some(r => r === 'doctor' || r === 'admin');
  }

  /** True when the user has at least one clinic assignment with the given role */
  hasAssignmentWithRole(user: AdminUserState, role: string): boolean {
    return user.assignments.some(a => a.role === role);
  }

  /** Navigate to the appropriate dashboard for a staff member */
  navigateToDashboard(user: AdminUserState): void {
    const hasDoctor = user.global_roles.includes('doctor');
    const hasAdmin = user.global_roles.includes('admin');
    if (hasDoctor) {
      this.router.navigate(['/home']);
    } else if (hasAdmin) {
      this.router.navigate(['/admin-dashboard']);
    }
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

    // ── Duplicate name check within this subscription (when allow_same_clinic_name !== 'yes') ──
    if (!this.allowSameClinicName) {
      const newName = this.clinicForm.name.trim().toLowerCase();
      const duplicate = this.clinics.find(c => {
        // Skip the clinic being edited so renaming to the same name is allowed
        if (this.editingClinic && c.id === this.editingClinic.id) return false;
        return c.name.trim().toLowerCase() === newName;
      });
      if (duplicate) {
        this.showToast(
          `A clinic named "${duplicate.name}" already exists in this subscription. Duplicate names are not allowed.`,
          'error'
        );
        return;
      }
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
      ' · ' + clinic.timings.map(t => `${t.label} ${this.to12h(t.start)}–${this.to12h(t.end)}`).join(', ');
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

  /** Convert 24h "HH:MM" string to 12h "H:MM AM/PM" format. */
  to12h(time: string): string {
    if (!time) return '';
    const [hStr, mStr] = time.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    const ampm = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

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
    // Cannot add staff without at least one clinic to assign them to.
    if (this.hasNoClinics) {
      this.showToast('Please create a clinic first before adding staff.', 'error');
      return;
    }
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
    this.startDraftSave();
    this.cdr.detectChanges();
  }

  openEditUserForm(user: AdminUserState): void {
    this.userForm = {
      ...user, global_roles: [...user.global_roles],
      assignments: user.assignments.map(a => ({
        ...a,
        availability: this.deepCopyAvail(a.availability),
        timingOverrides: this.deepCopyTimingOverrides(a.timingOverrides),
        dayBlockOverrides: this.deepCopyDayBlockOverrides(a.dayBlockOverrides),
      })),
    };
    this.editingUser = user;
    this.externalBookings = [];
    // Remember which clinics were in the form at open time
    this.originalFormClinicIds = new Set(this.userForm.assignments.map(a => `${a.clinicId}::${a.role}`));
    this.showUserForm = true;
    this.startDraftSave();
    this.cdr.detectChanges();
    // Load external bookings from DB in the background
    if (user.userId) this.loadExternalBookings(user.userId);
  }

  cancelUserForm(): void {
    this.showUserForm = false;
    this.editingUser = null;
    this.externalBookings = [];
    this.clearDraft();
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
    // Find first clinic that still has at least one role free
    const current = this.userForm.assignments;
    const available = this.clinics.filter(c => {
      const existing = current.filter(a => a.clinicId === c.id);
      const hasDoctor       = existing.some(a => a.role === 'doctor');
      const hasReceptionist = existing.some(a => a.role === 'receptionist');
      return !(hasDoctor && hasReceptionist);
    });
    if (!available.length) {
      this.showToast('All clinics already have both Doctor and Receptionist assigned.', 'error');
      return;
    }
    const c = available[0];
    // Choose whichever role isn't yet assigned for this clinic
    const existingForClinic = current.filter(a => a.clinicId === c.id);
    const hasRec  = existingForClinic.some(a => a.role === 'receptionist');
    const role: 'doctor' | 'receptionist' = hasRec ? 'doctor' : 'receptionist';
    this.userForm.assignments.push({
      clinicId: c.id, clinicName: c.name, clinicAddress: c.address || '',
      role, availability: {},
      timingOverrides: {}, dayBlockOverrides: {}
    });
    this.cdr.detectChanges();
  }

  removeClinicAssignment(i: number): void {
    this.userForm.assignments.splice(i, 1);
    this.cdr.detectChanges();
  }

  onAssignmentClinicChange(a: UserClinicAssignment, clinicId: string): void {
    const clinic = this.clinics.find(c => c.id === clinicId);
    a.clinicId = clinicId;
    a.clinicName = clinic?.name || clinicId;
    a.clinicAddress = clinic?.address || '';
    a.availability = {}; a.timingOverrides = {}; a.dayBlockOverrides = {};

    // Auto-correct role if the current role is already taken in another row for this clinic
    const othersForClinic = this.userForm.assignments.filter(
      other => other !== a && other.clinicId === clinicId
    );
    const doctorTaken       = othersForClinic.some(o => o.role === 'doctor');
    const receptionistTaken = othersForClinic.some(o => o.role === 'receptionist');
    if (a.role === 'doctor'       && doctorTaken)       a.role = 'receptionist';
    if (a.role === 'receptionist' && receptionistTaken) a.role = 'doctor';

    this.cdr.detectChanges();
  }

  onAssignmentRoleChange(a: UserClinicAssignment): void {
    // Guard: if the newly selected role is already taken by another row for this clinic, revert
    if (this.isRoleDisabledForAssignment(a, a.role)) {
      a.role = a.role === 'doctor' ? 'receptionist' : 'doctor';
      this.showToast(`That role is already assigned for this clinic. Switched to ${a.role}.`, 'error');
    }
    if (a.role !== 'doctor') { a.availability = {}; a.timingOverrides = {}; a.dayBlockOverrides = {}; }
    this.cdr.detectChanges();
  }

  /** Instantly selects a role for a clinic assignment — called directly from button (click). */
  selectRole(a: UserClinicAssignment, role: 'doctor' | 'receptionist'): void {
    if (this.isRoleDisabledForAssignment(a, role)) return; // already taken
    a.role = role;
    if (a.role !== 'doctor') { a.availability = {}; a.timingOverrides = {}; a.dayBlockOverrides = {}; }
    this.cdr.detectChanges();
  }

  /**
   * Returns true when the given role is already taken in another row for the same clinic.
   * Used to disable the corresponding radio chip.
   */
  isRoleDisabledForAssignment(currentAssignment: UserClinicAssignment, role: string): boolean {
    return this.userForm.assignments.some(
      a => a !== currentAssignment && a.clinicId === currentAssignment.clinicId && a.role === role
    );
  }

  getClinicForAssignment(clinicId: string): AdminClinicState | undefined {
    return this.clinics.find(c => c.id === clinicId);
  }

  /**
   * Returns clinics available for a given row's dropdown.
   * A clinic is excluded only when BOTH doctor AND receptionist roles are
   * already taken by other rows — allowing the same clinic to appear twice
   * (once as doctor, once as receptionist).
   */
  getAvailableClinicsForRow(currentAssignment: UserClinicAssignment): AdminClinicState[] {
    const others = this.userForm.assignments.filter(a => a !== currentAssignment);
    return this.clinics.filter(c => {
      const sameClinic = others.filter(a => a.clinicId === c.id);
      const hasDoctor       = sameClinic.some(a => a.role === 'doctor');
      const hasReceptionist = sameClinic.some(a => a.role === 'receptionist');
      // Exclude only if both roles are already taken
      return !(hasDoctor && hasReceptionist);
    });
  }

  /** Returns all weekdays across all current assignments (union), in canonical order */
  getUnionWeekdays(): string[] {
    const order = this.allWeekdays;
    const days = new Set<string>();
    for (const a of this.userForm.assignments) {
      const clinic = this.clinics.find(c => c.id === a.clinicId);
      if (clinic) clinic.weekdays.forEach(d => days.add(d));
    }
    return order.filter(d => days.has(d));
  }

  /** Returns the timing block list for a given assignment's clinic */
  getTimingsForAssignment(a: UserClinicAssignment): TimingBlock[] {
    return this.clinics.find(c => c.id === a.clinicId)?.timings || [];
  }

  /**
   * Returns the effective start/end for a specific day+block combination.
   * Priority: dayBlockOverrides[day][block] > timingOverrides[block] > clinic default.
   */
  getEffectiveDayTiming(a: UserClinicAssignment, day: string, blockLabel: string): { start: string; end: string } {
    const dayOverride = a.dayBlockOverrides?.[day]?.[blockLabel];
    if (dayOverride) return dayOverride;
    const blockOverride = a.timingOverrides?.[blockLabel];
    if (blockOverride) return blockOverride;
    const clinic = this.clinics.find(c => c.id === a.clinicId);
    const block = clinic?.timings.find(t => t.label === blockLabel);
    return block ? { start: block.start, end: block.end } : { start: '', end: '' };
  }

  /** Unique key for a per-day block cell error */
  private trErrKey(a: UserClinicAssignment, day: string, blockLabel: string): string {
    return `${a.clinicId}::${a.role}::${day}::${blockLabel}`;
  }

  /** Returns the current validation error for a cell (for use in template) */
  getTimeRangeError(a: UserClinicAssignment, day: string, blockLabel: string): string {
    return this.timeRangeErrors.get(this.trErrKey(a, day, blockLabel)) || '';
  }

  /** Mutates the per-day per-block override, strictly clamped to the clinic's block range */
  setDayBlockOverride(a: UserClinicAssignment, day: string, blockLabel: string, field: 'start' | 'end', value: string): void {
    if (!value) return;

    // Resolve the block's hard boundaries from the clinic DB
    const clinic = this.clinics.find(c => c.id === a.clinicId);
    const block  = clinic?.timings.find(t => t.label === blockLabel);
    const blockMin = block ? this.timeToMinutes(block.start) : 0;
    const blockMax = block ? this.timeToMinutes(block.end)   : 24 * 60;

    let mins = this.timeToMinutes(value);
    const errKey = this.trErrKey(a, day, blockLabel);
    let errMsg = '';

    if (field === 'start') {
      if (mins < blockMin) {
        errMsg = `Start cannot be before ${block!.start} (${blockLabel}: ${block!.start}–${block!.end})`;
        mins = blockMin;
      } else if (mins >= blockMax) {
        errMsg = `Start must be before ${block!.end} (${blockLabel} ends at ${block!.end})`;
        mins = blockMin;
      }
    } else {
      if (mins > blockMax) {
        errMsg = `End cannot exceed ${block!.end} (${blockLabel}: ${block!.start}–${block!.end})`;
        mins = blockMax;
      } else if (mins <= blockMin) {
        errMsg = `End must be after ${block!.start} (${blockLabel} starts at ${block!.start})`;
        mins = blockMax;
      }
    }

    if (errMsg) {
      this.timeRangeErrors.set(errKey, errMsg);
      // Error stays until user enters a valid value — no auto-clear
    } else {
      this.timeRangeErrors.delete(errKey);
    }

    // Re-format back to HH:MM
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const clamped = `${hh}:${mm}`;

    // Ensure start < end within the override itself
    if (!a.dayBlockOverrides) a.dayBlockOverrides = {};
    if (!a.dayBlockOverrides[day]) a.dayBlockOverrides[day] = {};
    if (!a.dayBlockOverrides[day][blockLabel]) {
      const eff = this.getEffectiveDayTiming(a, day, blockLabel);
      a.dayBlockOverrides[day][blockLabel] = { ...eff };
    }

    const override = a.dayBlockOverrides[day][blockLabel];
    if (field === 'start') {
      const endMins = this.timeToMinutes(override.end || block?.end || '');
      override.start = this.timeToMinutes(clamped) < endMins ? clamped : block?.start ?? clamped;
    } else {
      const startMins = this.timeToMinutes(override.start || block?.start || '');
      override.end = this.timeToMinutes(clamped) > startMins ? clamped : block?.end ?? clamped;
    }

    this.cdr.detectChanges();
  }


  toggleAvailability(a: UserClinicAssignment, day: string, block: string): void {
    if (!a.availability[day]) a.availability[day] = [];
    const idx = a.availability[day].indexOf(block);
    if (idx >= 0) a.availability[day].splice(idx, 1); else a.availability[day].push(block);
    this.cdr.detectChanges();
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
          return `⚠ Time overlaps with "${otherClinic.name}" (${otherBlock}: ${this.to12h(otherTiming.start)}–${this.to12h(otherTiming.end)}). You can still select it.`;
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

    // Specialization is mandatory when any assignment has doctor role
    const hasDocRole = this.userForm.assignments.some(a => a.role === 'doctor');
    if (hasDocRole && !this.userForm.specialization?.trim()) {
      this.showToast('Specialization is required for doctor role', 'error'); return;
    }

    // Doctor limit check — only block when adding a NEW doctor (edits are always allowed)
    if (!this.editingUser && hasDocRole && this.doctorLimitReached) {
      const max = this.subscription?.plan?.limits?.max_doctors ?? 0;
      this.showToast(`Doctor limit reached (${this.stats.doctors}/${max}). Upgrade your plan to add more.`, 'error');
      return;
    }

    // Receptionist limit check — only block when adding a NEW receptionist
    const hasRecepRole = this.userForm.assignments.some(a => a.role === 'receptionist');
    if (!this.editingUser && hasRecepRole && this.receptionistLimitReached) {
      const max = this.subscription?.plan?.limits?.max_receptionists ?? 0;
      this.showToast(`Receptionist limit reached (${this.stats.receptionists}/${max}). Upgrade your plan to add more.`, 'error');
      return;
    }

    // Duplicate assignment check — same clinic + same role should not appear twice
    const assignmentKeys = this.userForm.assignments.map(a => `${a.clinicId}::${a.role}`);
    const dupeKey = assignmentKeys.find((k, i) => assignmentKeys.indexOf(k) !== i);
    if (dupeKey) {
      const [cId, role] = dupeKey.split('::');
      const cName = this.clinics.find(c => c.id === cId)?.name || cId;
      this.showToast(`Duplicate assignment: "${cName}" already has a ${role} assignment. You can edit the existing one instead.`, 'error');
      return;
    }

    // Intra-form conflict check (time-range overlap between clinics)
    // Only blocks saving when allow_doctor_time_clash is OFF.
    // When ON the user is warned but can proceed.
    const doctorAssignments = this.userForm.assignments.filter(a => a.role === 'doctor');
    const clashMessages: string[] = [];
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
                clashMessages.push(
                  `${dayLabel}: "${c1.name}" (${b1} ${t1.start}–${t1.end}) and "${c2.name}" (${b2} ${t2.start}–${t2.end}) overlap`
                );
              }
            }
          }
        }
      }
    }

    if (clashMessages.length > 0) {
      if (!this.configSettings.allow_doctor_time_clash) {
        // Config is OFF — clash is not allowed → block save with error
        this.showToast(
          `${clashMessages[0]} — a doctor cannot be at two clinics simultaneously.`,
          'error'
        );
        return;
      } else {
        // Config is ON — clash is allowed but warn the user and ask to confirm
        const { default: Swal } = await import('sweetalert2');
        const clashList = clashMessages.map(m => `<li>${m}</li>`).join('');
        const result = await Swal.fire({
          title: 'Time Overlap Detected',
          html: `The following slots overlap across clinics:<br><ul style="text-align:left;margin-top:8px">${clashList}</ul><br>
                 Since <strong>Allow time-clash</strong> is ON, you can still save. Proceed?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, save anyway',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#148D9E',
          cancelButtonColor: '#6c757d',
        });
        if (!result.isConfirmed) return; // user cancelled
      }
    }

    this.isSaving = true;
    try {
      let userId = this.userForm.userId;
      // Derive assignment-based roles from the per-assignment roles
      const assignmentRoles = new Set(this.userForm.assignments.map(a => a.role));
      const derivedAssignmentRoles: string[] = [];
      if (assignmentRoles.has('doctor')) derivedAssignmentRoles.push('doctor');
      if (assignmentRoles.has('receptionist')) derivedAssignmentRoles.push('receptionist');
      if (derivedAssignmentRoles.length === 0) derivedAssignmentRoles.push('receptionist');

      const userPayload: any = {
        email: this.userForm.email.trim().toLowerCase(),
        name: this.userForm.name.trim(),
        specialization: this.userForm.specialization?.trim() || '',
        global_roles: derivedAssignmentRoles, // will be merged below if existing user
        status: this.userForm.status,
        subscription_id: this.subscription!.id,
      };
      if (userId) {
        // Editing existing user — check if email was changed to one that belongs to another user
        const oldUser = await this.adminService.getUserById(userId);
        const emailChanged = oldUser && oldUser.email.toLowerCase().trim() !== userPayload.email;

        if (emailChanged) {
          // Email was changed — check if the NEW email already belongs to another user
          const targetUser = await this.adminService.getUserByEmail(userPayload.email);
          if (targetUser && targetUser.id !== userId) {
            // Merge into the existing user with the new email
            const oldUserId = userId;
            userId = targetUser.id!;
            // Preserve non-assignment roles from the target user (admin, z_admin)
            const preservedRoles = (targetUser.global_roles || []).filter(
              (r: string) => !['doctor', 'receptionist'].includes(r)
            );
            userPayload.global_roles = [...new Set([...preservedRoles, ...derivedAssignmentRoles])];
            // Don't overwrite the target user's subscription_id if they have one
            if (targetUser.subscription_id && !userPayload.subscription_id) {
              userPayload.subscription_id = targetUser.subscription_id;
            }
            await this.adminService.updateUser(userId, userPayload);

            // Migrate clinic_user records from the old user to the target user
            const oldCUs = await this.adminService.getClinicUsers(this.subscription!.id);
            for (const cu of oldCUs.filter(cu => cu.user_id === oldUserId)) {
              await this.adminService.updateClinicUser(cu.id!, { user_id: userId } as any);
            }

            // Delete the old (now-orphaned) user doc
            await this.adminService.deleteUser(oldUserId);
          } else {
            // New email doesn't belong to anyone else — just update this user
            if (oldUser) {
              const preservedRoles = (oldUser.global_roles || []).filter(
                (r: string) => !['doctor', 'receptionist'].includes(r)
              );
              userPayload.global_roles = [...new Set([...preservedRoles, ...derivedAssignmentRoles])];
            }
            await this.adminService.updateUser(userId, userPayload);
          }
        } else {
          // Email not changed — standard update with role merge
          if (oldUser) {
            const preservedRoles = (oldUser.global_roles || []).filter(
              (r: string) => !['doctor', 'receptionist'].includes(r)
            );
            userPayload.global_roles = [...new Set([...preservedRoles, ...derivedAssignmentRoles])];
          }
          await this.adminService.updateUser(userId, userPayload);
        }
      } else {
        // New user — search by email WITHOUT subscription filter to avoid duplicates
        const existing = await this.adminService.getUserByEmail(userPayload.email);
        if (existing) {
          if (existing.subscription_id === this.subscription!.id) {
            // User belongs to this subscription (e.g. the admin user).
            // Allow assigning them additional roles (doctor/receptionist) instead of blocking.
            userId = existing.id!;
            const preservedRoles = (existing.global_roles || []).filter(
              (r: string) => !['doctor', 'receptionist'].includes(r)
            );
            userPayload.global_roles = [...new Set([...preservedRoles, ...derivedAssignmentRoles])];
            await this.adminService.updateUser(userId, userPayload);
          } else {
            this.showToast(
              `A staff member with email "${userPayload.email}" already exists (${existing.name}). Please use the Edit button to update their roles or assignments.`,
              'error'
            );
            this.isSaving = false;
            this.cdr.detectChanges();
            return;
          }
        } else {
          userId = await this.adminService.createUser(userPayload);
        }
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
        if (!this.configSettings.allow_doctor_time_clash) {
          this.showToast('Cannot save: ' + crossConflicts[0], 'error');
          this.isSaving = false;
          this.cdr.detectChanges();
          return;
        } else {
          // Config is ON — warn but allow proceeding
          const { default: Swal } = await import('sweetalert2');
          const conflictList = crossConflicts.map(m => `<li>${m}</li>`).join('');
          const result = await Swal.fire({
            title: 'Cross-Clinic Conflict Detected',
            html: `The following cross-clinic overlaps were found:<br>
                   <ul style="text-align:left;margin-top:8px">${conflictList}</ul><br>
                   Since <strong>Allow time-clash</strong> is ON, you can still save. Proceed?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, save anyway',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#148D9E',
            cancelButtonColor: '#6c757d',
          });
          if (!result.isConfirmed) {
            this.isSaving = false;
            this.cdr.detectChanges();
            return;
          }
        }
      }
      // Sync clinic assignments
      // Only delete clinic_user records that were originally in the form but
      // were explicitly removed by the admin. Do NOT delete records for clinics
      // that were never part of this editing session (preserves other clinics).
      const existingCUs = await this.adminService.getClinicUsers(this.subscription!.id);
      const userCUs = existingCUs.filter(cu => cu.user_id === userId);
      const newAssignmentKeys = new Set(this.userForm.assignments.map(a => `${a.clinicId}::${a.role}`));
      for (const cu of userCUs) {
        const cuKey = `${cu.clinic_id}::${(cu as any).role || ''}`;
        // Only delete if the clinic was originally in the form AND is now removed
        if (this.originalFormClinicIds.has(cuKey) && !newAssignmentKeys.has(cuKey)) {
          await this.adminService.deleteClinicUser(cu.id!);
        }
      }
      for (const assignment of this.userForm.assignments) {
        const existingCU = userCUs.find(cu => cu.clinic_id === assignment.clinicId && (cu as any).role === assignment.role);
        const cuPayload: any = {
          clinic_id: assignment.clinicId,
          user_id: userId, status: 'active',
          role: assignment.role,
        };
        if (assignment.role === 'doctor' && Object.keys(assignment.availability).length > 0)
          cuPayload.availability = assignment.availability;
        if (assignment.role === 'doctor' && assignment.timingOverrides && Object.keys(assignment.timingOverrides).length > 0)
          cuPayload.timingOverrides = assignment.timingOverrides;
        if (assignment.role === 'doctor' && assignment.dayBlockOverrides && Object.keys(assignment.dayBlockOverrides).length > 0)
          cuPayload.dayBlockOverrides = assignment.dayBlockOverrides;
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
          clinicAddress: clinic?.address || '',
          role,
          availability: this.deepCopyAvail((cu as any).availability || {}),
          timingOverrides: this.deepCopyTimingOverrides((cu as any).timingOverrides),
          dayBlockOverrides: this.deepCopyDayBlockOverrides((cu as any).dayBlockOverrides),
        };
      });
      const updated: AdminUserState = {
        userId, email: userPayload.email, name: userPayload.name, specialization: userPayload.specialization,
        global_roles: [...userPayload.global_roles], status: this.userForm.status,
        assignments: allAssignments,
      };
      const idx = this.users.findIndex(u => u.userId === userId);
      if (idx >= 0) this.users[idx] = updated; else this.users.push(updated);
      this.updateUserStats();
      this.showUserForm = false; this.editingUser = null;
      this.externalBookings = [];
      this.clearDraft();
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

  private deepCopyTimingOverrides(o?: Record<string, { start: string; end: string }>): Record<string, { start: string; end: string }> | undefined {
    if (!o) return undefined;
    const copy: Record<string, { start: string; end: string }> = {};
    for (const key of Object.keys(o)) copy[key] = { ...o[key] };
    return copy;
  }

  private deepCopyDayBlockOverrides(
    o?: Record<string, Record<string, { start: string; end: string }>>
  ): Record<string, Record<string, { start: string; end: string }>> | undefined {
    if (!o) return undefined;
    const copy: Record<string, Record<string, { start: string; end: string }>> = {};
    for (const day of Object.keys(o)) {
      copy[day] = {};
      for (const block of Object.keys(o[day])) copy[day][block] = { ...o[day][block] };
    }
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
