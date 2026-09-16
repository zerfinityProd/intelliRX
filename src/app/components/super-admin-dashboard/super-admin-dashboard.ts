// src/app/components/super-admin-dashboard/super-admin-dashboard.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthenticationService } from '../../services/authenticationService';
import { SuperAdminService, SuperAdminUser, DashboardOverview, UserWithSubscription } from '../../services/superAdminService';
import { ConfigService } from '../../services/configService';
import { PlanService } from '../../services/planService';
import { Subscription, PlanDetail } from '../../models/subscription.model';
import { PlanOption } from '../../models/subscription.model';
import { NavbarComponent } from '../navbar/navbar';

export interface PermissionSet {
  canAddPatient: boolean; canEdit: boolean; canDelete: boolean;
  canAddVisit: boolean; canEditVisit: boolean; canAppointment: boolean; canCancel: boolean;
}

export interface AdminPermissionSet {
  add_clinic: boolean;
  add_staff: boolean;
}

type ActiveTab = 'overview' | 'subscriptions' | 'system-config' | 'plans';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './super-admin-dashboard.html',
  styleUrl: './super-admin-dashboard.css',
})
export class SuperAdminDashboardComponent implements OnInit {
  private authService = inject(AuthenticationService);
  private superAdminService = inject(SuperAdminService);
  private configService = inject(ConfigService);
  private planService = inject(PlanService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // ── State ────────────────────────────────────────────────────────────────
  isLoading = true;
  isSaving = false;
  activeTab: ActiveTab = 'overview';
  adminName = '';
  adminEmail = '';
  currentTime = new Date();

  // ── Overview ────────────────────────────────────────────────────────────
  overview: DashboardOverview = {
    totalSubscriptions: 0, activeSubscriptions: 0,
    totalAdmins: 0, totalDoctors: 0, totalReceptionists: 0,
    totalClinics: 0, totalUsers: 0,
  };

  // ── Subscriptions ─────────────────────────────────────────────────────
  subscriptions: (Subscription & { id: string })[] = [];
  /** usage counts per subscription id, populated in loadSubscriptions() */
  subUsage: Map<string, { clinics: number; doctors: number; receptionists: number }> = new Map();
  planOptions: PlanOption[] = [];
  plansLoading = false;
  showSubForm = false;
  editingSub: (Subscription & { id: string }) | null = null;
  subForm = this.emptySubForm();
  subSearchQuery = '';
  filteredSubscriptions: (Subscription & { id: string })[] = [];

  // ── Admins ────────────────────────────────────────────────────────────
  adminUsers: SuperAdminUser[] = [];
  showAdminForm = false;
  editingAdmin: SuperAdminUser | null = null;
  adminForm: { email: string; name: string; subscription_id: string } = {
    email: '', name: '', subscription_id: '',
  };
  adminSearchQuery = '';

  // ── System Config ───────────────────────────────────────────────
  systemConfigEntries: { key: string; value: string; description: string; valueType: 'toggle' | 'int' | 'string' }[] = [];
  systemConfigLoaded = false;
  /** Keys removed locally but not yet committed to Firestore. */
  pendingDeletedKeys: string[] = [];
  configSearchQuery = '';
  filteredConfigEntries: (typeof this.systemConfigEntries[0] & { _origIndex: number })[] = [];

  updateConfigFilter(): void {
    const q = this.configSearchQuery.trim().toLowerCase();
    this.filteredConfigEntries = this.systemConfigEntries
      .map((e, i) => ({ ...e, _origIndex: i }))
      .filter(e => q.length < 1 || e.key.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    this.cdr.detectChanges();
  }

  // ── Config Entry Modal ────────────────────────────────────────────
  cfgModal: {
    visible: boolean;
    mode: 'add' | 'edit';
    editIndex: number;
    key: string;
    description: string;
    valueType: 'toggle' | 'int' | 'string';
    value: string;
    saving: boolean;
  } = { visible: false, mode: 'add', editIndex: -1, key: '', description: '', valueType: 'string', value: '', saving: false };

  // ── User Subscriptions ────────────────────────────────────────────────
  userSubItems: UserWithSubscription[] = [];
  userSubSearchQuery = '';
  showUserSubEditPanel = false;
  editingUserSub: UserWithSubscription | null = null;
  userSubForm: {
    plan_name: string;
    status: 'active' | 'inactive' | 'suspended';
    valid_until: string;
  } = { plan_name: '', status: 'active', valid_until: '' };

  // ── Permissions ──────────────────────────────────────────────────────
  readonly permissionDefs: { key: keyof PermissionSet; label: string; icon: string; desc: string }[] = [
    { key: 'canAddPatient',  label: 'Add Patient',        icon: '➕', desc: 'Register new patient records' },
    { key: 'canEdit',        label: 'Edit Patient',       icon: '✏️', desc: 'Modify patient information' },
    { key: 'canDelete',      label: 'Delete Records',     icon: '🗑️', desc: 'Delete patients or visits' },
    { key: 'canAddVisit',    label: 'Add Visit',          icon: '📋', desc: 'Create prescriptions & visit notes' },
    { key: 'canEditVisit',   label: 'Edit Visit',         icon: '📝', desc: 'Modify existing visit records' },
    { key: 'canAppointment', label: 'Book Appointment',   icon: '📅', desc: 'Schedule appointments' },
    { key: 'canCancel',      label: 'Cancel Appointment', icon: '❌', desc: 'Cancel existing appointments' },
  ];
  readonly adminPermissionDefs: { key: keyof AdminPermissionSet; label: string; icon: string; desc: string }[] = [
    { key: 'add_clinic', label: 'Add Clinic',  icon: '🏥', desc: 'Create and manage clinic locations' },
    { key: 'add_staff',  label: 'Add Staff',   icon: '👥', desc: 'Add and manage doctors & receptionists' },
  ];
  doctorPermissions: PermissionSet = {
    canAddPatient: true, canEdit: true, canDelete: false,
    canAddVisit: true, canEditVisit: true, canAppointment: true, canCancel: true,
  };
  receptionistPermissions: PermissionSet = {
    canAddPatient: true, canEdit: false, canDelete: false,
    canAddVisit: false, canEditVisit: false, canAppointment: true, canCancel: true,
  };
  adminPermissions: AdminPermissionSet = {
    add_clinic: true, add_staff: true,
  };
  permSaveSuccess = false;

  // ── Confirm Dialog ────────────────────────────────────────────────────
  confirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  private confirmResolve: ((v: boolean) => void) | null = null;

  // ── Delete-subscription name-confirm dialog ────────────────────────────
  deleteSubConfirmVisible = false;
  deleteSubTarget: (Subscription & { id: string }) | null = null;
  deleteSubNameInput = '';

  // ── Delete-plan name-confirm dialog ────────────────────────────────
  deletePlanConfirmVisible = false;
  deletePlanTarget: PlanDetail | null = null;
  deletePlanNameInput = '';

  // ── Toast ─────────────────────────────────────────────────────────────
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  toastVisible = false;
  private toastTimer: any;

  // ── Lifecycle ─────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    setInterval(() => { this.currentTime = new Date(); this.cdr.detectChanges(); }, 60000);
    await firstValueFrom(this.authService.authReady$.pipe(filter(r => r)));
    this.adminName = this.authService.currentUserValue?.name || 'Super Admin';
    this.adminEmail = this.authService.currentUserValue?.email || '';
    // Load plan options from plans collection (not configurations/system)
    this.plansLoading = true;
    try {
      const plans = await this.planService.getPlans();
      this.planOptions = plans.map(p => ({
        key: p.key,
        label: p.label || (p.key.charAt(0).toUpperCase() + p.key.slice(1)),
        days: p.validity_days ?? 30,
      }));
    } catch { /* non-blocking */ } finally { this.plansLoading = false; }
    await this.loadAll();
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private async loadAll(): Promise<void> {
    await Promise.all([
      this.loadOverview(),
      this.loadSubscriptions(),
      this.loadSystemConfig(),
      this.loadPlans(),
    ]);
  }

  async loadOverview(): Promise<void> {
    try { this.overview = await this.superAdminService.getDashboardOverview(); }
    catch (e: any) { this.showToast('Failed to load overview: ' + e.message, 'error'); }
  }

  async loadSubscriptions(): Promise<void> {
    try {
      const [subs, allClinics, allUsers] = await Promise.all([
        this.superAdminService.getAllSubscriptions(),
        this.superAdminService.getAllClinics().catch(() => [] as any[]),
        this.superAdminService.getAllUsersRaw().catch(() => [] as any[]),
      ]);
      this.subscriptions = subs;

      // Build usage map: subscription_id → { clinics, doctors, receptionists }
      const usageMap = new Map<string, { clinics: number; doctors: number; receptionists: number }>();

      // Clinic count from clinics collection
      for (const c of allClinics) {
        const sid: string = (c as any).subscription_id || '';
        if (!sid) continue;
        const e = usageMap.get(sid) ?? { clinics: 0, doctors: 0, receptionists: 0 };
        e.clinics++;
        usageMap.set(sid, e);
      }

      // Doctor + receptionist counts from users collection (by subscription_id + role)
      for (const u of allUsers) {
        const sid: string = (u as any).subscription_id || '';
        if (!sid) continue;
        const roles: string[] = (u as any).global_roles || [];
        const e = usageMap.get(sid) ?? { clinics: 0, doctors: 0, receptionists: 0 };
        if (roles.includes('doctor'))       e.doctors++;
        if (roles.includes('receptionist')) e.receptionists++;
        usageMap.set(sid, e);
      }

      this.subUsage = usageMap;
      this.filteredSubscriptions = this.subscriptions; // sync display list
    }
    catch (e: any) { this.showToast('Failed to load subscriptions', 'error'); }
  }

  async loadAdminUsers(): Promise<void> {
    try { this.adminUsers = await this.superAdminService.getAdminUsers(); }
    catch (e: any) { this.showToast('Failed to load admin users', 'error'); }
  }

  async loadUserSubscriptions(): Promise<void> {
    try { this.userSubItems = await this.superAdminService.getAllUsersWithSubscriptions(); }
    catch (e: any) { this.showToast('Failed to load user subscriptions', 'error'); }
  }

  async loadSystemConfig(): Promise<void> {
    try {
      const cfg = await this.configService.getSystemConfig();
      // New clean structure: real values are flat, metadata lives in _meta map
      const meta = ((cfg['_meta'] as unknown) as Record<string, { type: 'toggle'|'int'|'string'; description: string }>) || {};
      this.systemConfigEntries = Object.entries(cfg)
        .filter(([k]) => k !== '_meta' && k !== 'updated_at')
        // Also skip any legacy __desc__ / __type__ keys from old format
        .filter(([k]) => !k.startsWith('__desc__') && !k.startsWith('__type__'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => {
          const m = meta[key];
          const stored = m?.type;
          const valueType: 'toggle'|'int'|'string' = stored ?? (
            String(value) === 'yes' || String(value) === 'no' ? 'toggle' :
            !isNaN(Number(value)) && String(value) !== '' ? 'int' : 'string'
          );
          return { key, value: String(value), description: m?.description ?? '', valueType };
        });
      this.pendingDeletedKeys = [];
      this.systemConfigLoaded = true;
      this.updateConfigFilter();
    } catch (e: any) {
      this.showToast('Failed to load system config', 'error');
    }
  }

  /** Build the Firestore document payload from current entries. */
  private buildCfgPayload(): Record<string, any> {
    const doc: Record<string, any> = {};
    const meta: Record<string, { type: string; description: string }> = {};
    for (const entry of this.systemConfigEntries) {
      if (!entry.key.trim()) continue;
      doc[entry.key] = entry.valueType === 'int' ? Number(entry.value) : entry.value;
      meta[entry.key] = { type: entry.valueType, description: entry.description ?? '' };
    }
    doc['_meta'] = meta;
    return doc;
  }

  /** Save Config — only needed to commit pending deletions. */
  async saveSystemConfig(): Promise<void> {
    this.isSaving = true;
    this.cdr.detectChanges();
    try {
      await this.configService.setSystemConfig(this.buildCfgPayload());
      this.pendingDeletedKeys = [];
      this.showToast('Deletions committed successfully');
    } catch (e: any) {
      this.showToast('Failed to save config: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  /** Opens the Add/Edit config modal. */
  openCfgModal(mode: 'add' | 'edit', index = -1): void {
    if (mode === 'edit' && index >= 0) {
      const e = this.systemConfigEntries[index];
      this.cfgModal = { visible: true, mode: 'edit', editIndex: index,
        key: e.key, description: e.description, valueType: e.valueType, value: e.value, saving: false };
    } else {
      this.cfgModal = { visible: true, mode: 'add', editIndex: -1,
        key: '', description: '', valueType: 'string', value: '', saving: false };
    }
    this.cdr.detectChanges();
  }

  closeCfgModal(): void {
    this.cfgModal.visible = false;
    this.cdr.detectChanges();
  }

  async saveCfgModal(): Promise<void> {
    const k = this.cfgModal.key.trim();
    if (!k) { this.showToast('Key is required', 'error'); return; }
    if (this.cfgModal.mode === 'add' && this.systemConfigEntries.some(e => e.key === k)) {
      this.showToast(`Key "${k}" already exists`, 'error'); return;
    }
    let val = this.cfgModal.value;
    if (this.cfgModal.valueType === 'toggle') val = val === 'yes' ? 'yes' : 'no';
    if (this.cfgModal.valueType === 'int' && isNaN(Number(val))) { this.showToast('Value must be a number', 'error'); return; }

    const entry = { key: k, description: this.cfgModal.description, valueType: this.cfgModal.valueType, value: val };
    if (this.cfgModal.mode === 'edit') {
      this.systemConfigEntries = this.systemConfigEntries.map((e, i) => i === this.cfgModal.editIndex ? entry : e);
    } else {
      this.systemConfigEntries = [...this.systemConfigEntries, entry].sort((a, b) => a.key.localeCompare(b.key));
    }
    this.updateConfigFilter();

    // Save immediately to Firestore
    this.cfgModal.saving = true;
    this.cdr.detectChanges();
    try {
      await this.configService.setSystemConfig(this.buildCfgPayload());
      this.showToast(this.cfgModal.mode === 'add' ? 'Key added & saved' : 'Changes saved');
      this.cfgModal.visible = false;
    } catch (e: any) {
      this.showToast('Failed to save: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      this.cfgModal.saving = false;
      this.cdr.detectChanges();
    }
  }

  removeConfigEntry(origIndex: number): void {
    const removed = this.systemConfigEntries[origIndex];
    if (removed) this.pendingDeletedKeys = [...this.pendingDeletedKeys, removed.key];
    this.systemConfigEntries = this.systemConfigEntries.filter((_, i) => i !== origIndex);
    this.updateConfigFilter();
  }

  // ── Navigation ────────────────────────────────────────────────────────
  setTab(tab: ActiveTab): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/app/login']);
  }

  // ── Getters ───────────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }

  // ── Analytics helpers ────────────────────────────────────────────────
  get subStatusCounts(): { active: number; expired: number; inactive: number; suspended: number } {
    const now = new Date();
    let active = 0, expired = 0, inactive = 0, suspended = 0;
    for (const s of this.subscriptions) {
      const isExp = s.valid_until ? new Date(s.valid_until) < now : false;
      if (isExp) { expired++; }
      else if (s.status === 'active') { active++; }
      else if (s.status === 'suspended') { suspended++; }
      else { inactive++; }
    }
    return { active, expired, inactive, suspended };
  }

  private buildDonut(
    segments: { label: string; count: number; color: string }[]
  ): { label: string; count: number; color: string; dash: string; offset: string }[] {
    const total = segments.reduce((s, g) => s + g.count, 0) || 1;
    const circumference = 2 * Math.PI * 70; // r=70
    let consumed = 0;
    return segments.map(seg => {
      const frac = seg.count / total;
      const dash = `${frac * circumference} ${circumference}`;
      // offset: start at top (-circumference/4) minus already consumed
      const offset = String(-(consumed * circumference) + circumference / 4);
      consumed += frac;
      return { ...seg, dash, offset };
    });
  }

  get statusDonutSegments() {
    const c = this.subStatusCounts;
    return this.buildDonut([
      { label: 'Active',    count: c.active,    color: '#1CB5C9' },
      { label: 'Expired',   count: c.expired,   color: '#E05252' },
      { label: 'Inactive',  count: c.inactive,  color: '#A0AEB5' },
      { label: 'Suspended', count: c.suspended, color: '#F59E0B' },
    ]);
  }

  get planDonutSegments() {
    const planColors = ['#148D9E','#0E7A8C','#1CB5C9','#37C8D9','#6DD7E4','#A0E5ED'];
    const countMap = new Map<string, number>();
    for (const s of this.subscriptions) {
      const key = s.plan?.name || 'unknown';
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
    const entries = Array.from(countMap.entries()).map(([label, count], i) => ({
      label, count, color: planColors[i % planColors.length],
    }));
    return this.buildDonut(entries.length ? entries : [{ label: 'No subs', count: 1, color: '#C8DDE3' }]);
  }

  get expiryDonutSegments() {
    const now = new Date();
    const in7  = new Date(now); in7.setDate(now.getDate() + 7);
    const in30 = new Date(now); in30.setDate(now.getDate() + 30);
    let already = 0, within7 = 0, within30 = 0, beyond = 0;
    for (const s of this.subscriptions) {
      if (!s.valid_until) { beyond++; continue; }
      const exp = new Date(s.valid_until);
      if (exp < now)   { already++; }
      else if (exp <= in7)  { within7++; }
      else if (exp <= in30) { within30++; }
      else                  { beyond++; }
    }
    return this.buildDonut([
      { label: 'Already expired', count: already,  color: '#E05252' },
      { label: 'Expiring ≤7d',    count: within7,  color: '#F59E0B' },
      { label: 'Expiring ≤30d',   count: within30, color: '#1CB5C9' },
      { label: 'Valid >30d',      count: beyond,   color: '#22C55E' },
    ]);
  }

  usagePct(sub: Subscription & { id: string }, field: 'clinics' | 'doctors'): number {
    const usage = this.subUsage.get(sub.id);
    if (!usage) return 0;
    const used = usage[field];
    const max = field === 'clinics'
      ? (sub.plan?.limits?.max_clinics ?? 0)
      : (sub.plan?.limits?.max_doctors ?? 0);
    if (!max) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  }

  onSubSearch(): void {
    const q = this.subSearchQuery.trim().toLowerCase();
    if (q.length < 3) {
      this.filteredSubscriptions = this.subscriptions;
    } else {
      this.filteredSubscriptions = this.subscriptions.filter(s =>
        s.entity_name?.toLowerCase().includes(q) ||
        s.owner_email?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }
    this.cdr.detectChanges();
  }

  get filteredAdmins(): SuperAdminUser[] {
    if (!this.adminSearchQuery.trim()) return this.adminUsers;
    const q = this.adminSearchQuery.toLowerCase();
    return this.adminUsers.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }

  getAdminSubscription(admin: SuperAdminUser): string {
    if (!admin.subscription_id) return '—';
    const sub = this.subscriptions.find(s => s.id === admin.subscription_id);
    return sub?.entity_name || admin.subscription_id;
  }

  // ── User Subscription helpers ────────────────────────────────────────

  get filteredUserSubs(): UserWithSubscription[] {
    if (!this.userSubSearchQuery.trim()) return this.userSubItems;
    const q = this.userSubSearchQuery.toLowerCase();
    return this.userSubItems.filter(item =>
      item.user.name.toLowerCase().includes(q) ||
      item.user.email.toLowerCase().includes(q) ||
      item.subscription?.entity_name?.toLowerCase().includes(q) ||
      item.subscription?.plan?.name?.toLowerCase().includes(q)
    );
  }

  getUserRoleBadges(user: SuperAdminUser): string[] {
    return (user.global_roles || []).filter(r => r !== 'z_admin');
  }

  isExpired(validUntil: string | undefined): boolean {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  }

  getSubStatusClass(sub: (Subscription & { id: string }) | null): string {
    if (!sub) return 'badge-inactive';
    if (this.isExpired(sub.valid_until)) return 'badge-expired';
    return this.getStatusClass(sub.status);
  }

  getSubStatusLabel(sub: (Subscription & { id: string }) | null): string {
    if (!sub) return '—';
    if (this.isExpired(sub.valid_until)) return 'expired';
    return sub.status;
  }

  isoToDateInput(iso: string | undefined): string {
    if (!iso) return '';
    return iso.split('T')[0];
  }

  openEditUserSub(item: UserWithSubscription): void {
    this.editingUserSub = item;
    const sub = item.subscription;
    this.userSubForm = {
      plan_name: sub?.plan?.name || '',
      status: (sub?.status as 'active' | 'inactive' | 'suspended') || 'active',
      valid_until: this.isoToDateInput(sub?.valid_until),
    };
    this.showUserSubEditPanel = true;
    this.cdr.detectChanges();
  }

  cancelUserSubEdit(): void {
    this.showUserSubEditPanel = false;
    this.editingUserSub = null;
    this.cdr.detectChanges();
  }

  async saveUserSub(): Promise<void> {
    if (!this.editingUserSub?.subscription) {
      this.showToast('No subscription linked to this user', 'error');
      return;
    }
    this.isSaving = true;
    this.cdr.detectChanges();
    try {
      const subId = this.editingUserSub.subscription.id;
      const validUntil = this.userSubForm.valid_until
        ? new Date(this.userSubForm.valid_until).toISOString()
        : (this.editingUserSub.subscription.valid_until || '');

      // Preserve existing plan limits; only update the plan name
      const existingLimits = this.editingUserSub.subscription.plan?.limits || {
        max_clinics: 5, max_doctors: 10, max_receptionists: 10, max_appointments_per_day: 50,
      };

      await this.superAdminService.updateSubscriptionDetails(subId, {
        plan: { name: this.userSubForm.plan_name, limits: existingLimits },
        status: this.userSubForm.status,
        valid_until: validUntil,
      });

      // Update local cache so UI reflects the change immediately
      const idx = this.userSubItems.findIndex(i => i === this.editingUserSub);
      if (idx >= 0) {
        this.userSubItems = [...this.userSubItems];
        this.userSubItems[idx] = {
          ...this.userSubItems[idx],
          subscription: {
            ...this.editingUserSub.subscription!,
            plan: { name: this.userSubForm.plan_name, limits: existingLimits },
            status: this.userSubForm.status,
            valid_until: validUntil,
          },
        };
      }
      // Also refresh the subscriptions list used by Overview tab
      const subIdx = this.subscriptions.findIndex(s => s.id === subId);
      if (subIdx >= 0) {
        this.subscriptions = [...this.subscriptions];
        this.subscriptions[subIdx] = {
          ...this.subscriptions[subIdx],
          plan: { name: this.userSubForm.plan_name, limits: existingLimits },
          status: this.userSubForm.status,
          valid_until: validUntil,
        };
      }

      this.showToast('Subscription updated successfully');
      this.showUserSubEditPanel = false;
      this.editingUserSub = null;
    } catch (e: any) {
      this.showToast('Failed to update: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  countActivePerms(perms: PermissionSet | AdminPermissionSet): number {
    return Object.values(perms).filter(Boolean).length;
  }

  subInitial(sub: Subscription & { id: string }): string {
    return sub.entity_name?.trim()?.[0]?.toUpperCase() || '?';
  }

  getStatusClass(status: string): string {
    if (status === 'active') return 'badge-active';
    if (status === 'suspended') return 'badge-suspended';
    return 'badge-inactive';
  }

  // ── Subscription CRUD ────────────────────────────────────────────────
  openNewSubForm(): void {
    this.editingSub = null;
    this.subForm = this.emptySubForm();
    this.showSubForm = true;
    this.cdr.detectChanges();
  }

  openEditSubForm(sub: Subscription & { id: string }): void {
    this.editingSub = sub;
    this.subForm = {
      entity_name: sub.entity_name,
      owner_email: sub.owner_email,
      billing_email: sub.billing_email || '',
      plan_name: sub.plan?.name as 'basic' | 'premium' || 'basic',
      max_clinics: sub.plan?.limits?.max_clinics || 5,
      max_doctors: sub.plan?.limits?.max_doctors || 10,
      max_receptionists: sub.plan?.limits?.max_receptionists || 10,
      max_appointments_per_day: sub.plan?.limits?.max_appointments_per_day || 50,
      status: sub.status,
    };
    this.showSubForm = true;
    this.cdr.detectChanges();
  }

  cancelSubForm(): void {
    this.showSubForm = false;
    this.editingSub = null;
    this.cdr.detectChanges();
  }

  async saveSub(): Promise<void> {
    if (!this.subForm.entity_name.trim() || !this.subForm.owner_email.trim()) {
      this.showToast('Entity name and owner email are required', 'error'); return;
    }
    this.isSaving = true;
    try {
      const data = {
        entity_name: this.subForm.entity_name.trim(),
        owner_email: this.subForm.owner_email.trim().toLowerCase(),
        billing_email: this.subForm.billing_email.trim().toLowerCase() || this.subForm.owner_email.trim().toLowerCase(),
        plan: {
          name: this.subForm.plan_name,
          limits: {
            max_clinics: this.subForm.max_clinics,
            max_doctors: this.subForm.max_doctors,
            max_receptionists: this.subForm.max_receptionists,
            max_appointments_per_day: this.subForm.max_appointments_per_day,
          },
        },
        status: this.subForm.status,
      };
      if (this.editingSub) {
        await this.superAdminService.updateSubscription(this.editingSub.id, data);
        const idx = this.subscriptions.findIndex(s => s.id === this.editingSub!.id);
        if (idx >= 0) this.subscriptions[idx] = { ...this.subscriptions[idx], ...data };
        this.showToast('Subscription updated successfully');
      } else {
        const newId = this.superAdminService.computeNextSubscriptionId(this.subscriptions.map(s => s.id));
        // Fetch validity days for the chosen plan and compute valid_until
        const validityDays = this.subForm.plan_name
          ? await this.configService.getPlanValidityDays(this.subForm.plan_name)
          : 30;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + validityDays);
        const valid_until = expiryDate.toISOString();

        await this.superAdminService.createSubscription({ ...data, valid_until }, newId, validityDays);
        this.subscriptions.push({
          ...data, valid_until, id: newId,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        } as any);
        const expiryStr = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        this.showToast(`Subscription created — valid until ${expiryStr}`);
      }
      this.overview.totalSubscriptions = this.subscriptions.length;
      this.overview.activeSubscriptions = this.subscriptions.filter(s => s.status === 'active').length;
      this.filteredSubscriptions = [...this.subscriptions]; // keep display list in sync
      this.showSubForm = false;
      this.editingSub = null;
    } catch (e: any) { this.showToast('Failed to save: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  /** Opens the name-confirmation dialog for deleting a subscription. */
  deleteSub(sub: Subscription & { id: string }): void {
    this.deleteSubTarget = sub;
    this.deleteSubNameInput = '';
    this.deleteSubConfirmVisible = true;
    this.cdr.detectChanges();
  }

  onDeleteSubCancel(): void {
    this.deleteSubConfirmVisible = false;
    this.deleteSubTarget = null;
    this.deleteSubNameInput = '';
    this.cdr.detectChanges();
  }

  async onDeleteSubConfirm(): Promise<void> {
    const sub = this.deleteSubTarget;
    if (!sub || this.deleteSubNameInput.trim() !== sub.entity_name.trim()) return;
    this.deleteSubConfirmVisible = false;
    this.deleteSubTarget = null;
    this.deleteSubNameInput = '';
    this.isSaving = true;
    this.cdr.detectChanges();
    try {
      await this.superAdminService.deleteSubscription(sub.id);
      this.subscriptions = this.subscriptions.filter(s => s.id !== sub.id);
      this.filteredSubscriptions = [...this.subscriptions];
      this.overview.totalSubscriptions = this.subscriptions.length;
      this.showToast('Subscription deleted');
    } catch (e: any) { this.showToast('Failed to delete: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  private emptySubForm() {
    return {
      entity_name: '', owner_email: '', billing_email: '',
      plan_name: '' as string,   // populated from Firestore planOptions
      max_clinics: 5, max_doctors: 10, max_receptionists: 10, max_appointments_per_day: 50,
      status: 'active' as 'active' | 'inactive' | 'suspended',
    };
  }

  /** True when the given ISO valid_until date is in the past. */
  isSubExpired(validUntil: string | undefined): boolean {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  }

  /** Computed expiry preview shown in the form before saving */
  get subFormExpiryPreview(): string {
    const plan = this.planOptions.find(p => p.key === this.subForm.plan_name);
    if (!plan || this.editingSub) return '';
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.days);
    return expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Admin User CRUD ───────────────────────────────────────────────────
  openNewAdminForm(): void {
    this.editingAdmin = null;
    this.adminForm = { email: '', name: '', subscription_id: '' };
    this.showAdminForm = true;
    this.cdr.detectChanges();
  }

  openEditAdminForm(admin: SuperAdminUser): void {
    this.editingAdmin = admin;
    this.adminForm = {
      email: admin.email,
      name: admin.name,
      subscription_id: admin.subscription_id || '',
    };
    this.showAdminForm = true;
    this.cdr.detectChanges();
  }

  cancelAdminForm(): void {
    this.showAdminForm = false;
    this.editingAdmin = null;
    this.cdr.detectChanges();
  }

  async saveAdmin(): Promise<void> {
    if (!this.adminForm.email.trim() || !this.adminForm.name.trim()) {
      this.showToast('Email and name are required', 'error'); return;
    }
    if (!this.adminForm.subscription_id) {
      this.showToast('Please assign a subscription to this admin', 'error'); return;
    }
    this.isSaving = true;
    try {
      if (this.editingAdmin) {
        await this.superAdminService.updateAdminUser(this.editingAdmin.id!, {
          name: this.adminForm.name.trim(),
          subscription_id: this.adminForm.subscription_id,
        });
        const idx = this.adminUsers.findIndex(u => u.id === this.editingAdmin!.id);
        if (idx >= 0) this.adminUsers[idx] = {
          ...this.adminUsers[idx],
          name: this.adminForm.name.trim(),
          subscription_id: this.adminForm.subscription_id,
        };
        this.showToast('Admin updated successfully');
      } else {
        const newId = await this.superAdminService.createAdminUser({
          email: this.adminForm.email.trim().toLowerCase(),
          name: this.adminForm.name.trim(),
          subscription_id: this.adminForm.subscription_id,
        });
        this.adminUsers.push({
          id: newId,
          email: this.adminForm.email.trim().toLowerCase(),
          name: this.adminForm.name.trim(),
          global_roles: ['admin'],
          subscription_id: this.adminForm.subscription_id,
          status: 'active',
        });
        this.overview.totalAdmins = this.adminUsers.length;
        this.showToast('Admin created successfully');
      }
      this.showAdminForm = false;
      this.editingAdmin = null;
    } catch (e: any) { this.showToast('Failed to save admin: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  async deleteAdmin(admin: SuperAdminUser): Promise<void> {
    const ok = await this.showConfirm('Delete Admin', `Delete admin "${admin.name}"? This user will lose access.`);
    if (!ok) return;
    this.isSaving = true;
    try {
      await this.superAdminService.deleteAdminUser(admin.id!);
      this.adminUsers = this.adminUsers.filter(u => u.id !== admin.id);
      this.overview.totalAdmins = this.adminUsers.length;
      this.showToast('Admin deleted');
    } catch (e: any) { this.showToast('Failed to delete admin: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  async reassignSubscription(admin: SuperAdminUser, subscriptionId: string): Promise<void> {
    if (!subscriptionId || !admin.id) return;
    try {
      await this.superAdminService.assignSubscriptionToAdmin(admin.id, subscriptionId);
      const idx = this.adminUsers.findIndex(u => u.id === admin.id);
      if (idx >= 0) this.adminUsers[idx] = { ...this.adminUsers[idx], subscription_id: subscriptionId };
      this.showToast('Subscription assigned');
    } catch (e: any) { this.showToast('Failed to assign subscription', 'error'); }
    finally { this.cdr.detectChanges(); }
  }

  // ── Plans ──────────────────────────────────────────────────────────────
  planList: PlanDetail[] = [];
  showPlanForm = false;
  editingPlan: PlanDetail | null = null;
  planForm: {
    key: string; label: string; description: string;
    monthly_charges: number; quarterly_charges: number; yearly_charges: number;
    max_clinics: number; max_doctors: number; max_receptionists: number;
    max_patients: number; validity_days: number;
    grace_period: number; plan_ending_nf: number;
  } = this.emptyPlanForm();

  private emptyPlanForm() {
    return {
      key: '', label: '', description: '',
      monthly_charges: 0, quarterly_charges: 0, yearly_charges: 0,
      max_clinics: 1, max_doctors: 5, max_receptionists: 2,
      max_patients: 100, validity_days: 30,
      grace_period: 0, plan_ending_nf: 7,
    };
  }

  async loadPlans(): Promise<void> {
    try {
      this.planList = await this.planService.getPlans();
    } catch (e: any) { this.showToast('Failed to load plans', 'error'); }
  }

  openNewPlanForm(): void {
    this.editingPlan = null;
    this.planForm = this.emptyPlanForm();
    this.showPlanForm = true;
  }

  openEditPlanForm(plan: PlanDetail): void {
    this.editingPlan = plan;
    this.planForm = {
      key: plan.key,
      label: plan.label,
      description: plan.description || '',
      monthly_charges: plan.monthly_charges,
      quarterly_charges: plan.quarterly_charges,
      yearly_charges: plan.yearly_charges,
      max_clinics: plan.max_clinics,
      max_doctors: plan.max_doctors,
      max_receptionists: plan.max_receptionists,
      max_patients: plan.max_patients,
      validity_days: plan.validity_days,
      grace_period: (plan as any).grace_period ?? 0,
      plan_ending_nf: plan.plan_ending_nf ?? 7,
    };
    this.showPlanForm = true;
  }

  async savePlanForm(): Promise<void> {
    const key = this.planForm.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) { this.showToast('Plan key is required', 'error'); return; }
    this.isSaving = true;
    try {
      const { key: _k, ...rest } = this.planForm;
      await this.planService.savePlan(key, rest as any);
      await this.loadPlans();
      // refresh planOptions dropdown too
      this.planOptions = this.planList.map(p => ({
        key: p.key,
        label: p.label || (p.key.charAt(0).toUpperCase() + p.key.slice(1)),
        days: p.validity_days ?? 30,
      }));
      this.showToast(this.editingPlan ? 'Plan updated' : 'Plan created');
      this.showPlanForm = false;
    } catch (e: any) { this.showToast('Failed to save plan: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  /** Opens the name-confirmation dialog for deleting a plan. */
  deletePlanItem(plan: PlanDetail): void {
    this.deletePlanTarget = plan;
    this.deletePlanNameInput = '';
    this.deletePlanConfirmVisible = true;
    this.cdr.detectChanges();
  }

  onDeletePlanCancel(): void {
    this.deletePlanConfirmVisible = false;
    this.deletePlanTarget = null;
    this.deletePlanNameInput = '';
    this.cdr.detectChanges();
  }

  async onDeletePlanConfirm(): Promise<void> {
    const plan = this.deletePlanTarget;
    const expectedName = plan?.label || plan?.key || '';
    if (!plan || this.deletePlanNameInput.trim() !== expectedName.trim()) return;
    this.deletePlanConfirmVisible = false;
    this.deletePlanTarget = null;
    this.deletePlanNameInput = '';
    try {
      await this.planService.deletePlan(plan.key);
      this.planList = this.planList.filter(p => p.key !== plan.key);
      this.showToast('Plan deleted');
    } catch (e: any) { this.showToast('Failed to delete plan: ' + e.message, 'error'); }
    this.cdr.detectChanges();
  }

  cancelPlanForm(): void {
    this.showPlanForm = false;
    this.editingPlan = null;
    this.planForm = this.emptyPlanForm();
  }

  // ── Permissions ───────────────────────────────────────────────────────
  async savePermissions(): Promise<void> {
    this.isSaving = true;
    try {
      const dp = this.permissionDefs.filter(p => this.doctorPermissions[p.key]).map(p => p.key as string);
      const rp = this.permissionDefs.filter(p => this.receptionistPermissions[p.key]).map(p => p.key as string);
      const ap = this.adminPermissionDefs.filter(p => this.adminPermissions[p.key]).map(p => p.key as string);
      await Promise.all([
        this.superAdminService.setRolePermissions('doctor', dp),
        this.superAdminService.setRolePermissions('receptionist', rp),
        this.superAdminService.setRolePermissions('admin', ap),
      ]);
      this.showToast('Role permissions saved successfully');
    } catch (e: any) { this.showToast('Failed to save permissions: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  // ── Confirm Dialog ────────────────────────────────────────────────────
  showConfirm(title: string, message: string): Promise<boolean> {
    this.confirmTitle = title; this.confirmMessage = message;
    this.confirmVisible = true; this.cdr.detectChanges();
    return new Promise(resolve => { this.confirmResolve = resolve; });
  }
  onConfirmYes() { this.confirmVisible = false; this.confirmResolve?.(true); this.confirmResolve = null; }
  onConfirmNo()  { this.confirmVisible = false; this.confirmResolve?.(false); this.confirmResolve = null; }

  // ── Toast ─────────────────────────────────────────────────────────────
  showToast(msg: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage = msg; this.toastType = type;
    this.toastVisible = true; this.cdr.detectChanges();
    this.toastTimer = setTimeout(() => { this.toastVisible = false; this.cdr.detectChanges(); }, 3500);
  }
}
