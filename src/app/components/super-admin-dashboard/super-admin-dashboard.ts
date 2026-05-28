// src/app/components/super-admin-dashboard/super-admin-dashboard.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthenticationService } from '../../services/authenticationService';
import { SuperAdminService, SuperAdminUser, DashboardOverview } from '../../services/superAdminService';
import { Subscription } from '../../models/subscription.model';
import { NavbarComponent } from '../navbar/navbar';

export interface PermissionSet {
  canAddPatient: boolean; canEdit: boolean; canDelete: boolean;
  canAddVisit: boolean; canEditVisit: boolean; canAppointment: boolean; canCancel: boolean;
}

type ActiveTab = 'overview' | 'subscriptions' | 'admins' | 'permissions';

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
  showSubForm = false;
  editingSub: (Subscription & { id: string }) | null = null;
  subForm = this.emptySubForm();
  subSearchQuery = '';

  // ── Admins ────────────────────────────────────────────────────────────
  adminUsers: SuperAdminUser[] = [];
  showAdminForm = false;
  editingAdmin: SuperAdminUser | null = null;
  adminForm: { email: string; name: string; subscription_id: string } = {
    email: '', name: '', subscription_id: '',
  };
  adminSearchQuery = '';

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
  doctorPermissions: PermissionSet = {
    canAddPatient: true, canEdit: true, canDelete: false,
    canAddVisit: true, canEditVisit: true, canAppointment: true, canCancel: true,
  };
  receptionistPermissions: PermissionSet = {
    canAddPatient: true, canEdit: false, canDelete: false,
    canAddVisit: false, canEditVisit: false, canAppointment: true, canCancel: true,
  };
  permSaveSuccess = false;

  // ── Confirm Dialog ────────────────────────────────────────────────────
  confirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  private confirmResolve: ((v: boolean) => void) | null = null;

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
    await this.loadAll();
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private async loadAll(): Promise<void> {
    await Promise.all([
      this.loadOverview(),
      this.loadSubscriptions(),
      this.loadAdminUsers(),
      this.loadPermissions(),
    ]);
  }

  async loadOverview(): Promise<void> {
    try { this.overview = await this.superAdminService.getDashboardOverview(); }
    catch (e: any) { this.showToast('Failed to load overview: ' + e.message, 'error'); }
  }

  async loadSubscriptions(): Promise<void> {
    try { this.subscriptions = await this.superAdminService.getAllSubscriptions(); }
    catch (e: any) { this.showToast('Failed to load subscriptions', 'error'); }
  }

  async loadAdminUsers(): Promise<void> {
    try { this.adminUsers = await this.superAdminService.getAdminUsers(); }
    catch (e: any) { this.showToast('Failed to load admin users', 'error'); }
  }

  async loadPermissions(): Promise<void> {
    try {
      const dp = await this.superAdminService.getRolePermissions('doctor');
      const rp = await this.superAdminService.getRolePermissions('receptionist');
      this.permissionDefs.forEach(p => {
        (this.doctorPermissions as any)[p.key] = dp.includes(p.key);
        (this.receptionistPermissions as any)[p.key] = rp.includes(p.key);
      });
    } catch (e: any) { this.showToast('Failed to load permissions', 'error'); }
  }

  // ── Navigation ────────────────────────────────────────────────────────
  setTab(tab: ActiveTab): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  // ── Getters ───────────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }

  get filteredSubscriptions(): (Subscription & { id: string })[] {
    if (!this.subSearchQuery.trim()) return this.subscriptions;
    const q = this.subSearchQuery.toLowerCase();
    return this.subscriptions.filter(s =>
      s.entity_name?.toLowerCase().includes(q) ||
      s.owner_email?.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
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

  countActivePerms(perms: PermissionSet): number {
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
        await this.superAdminService.createSubscription(data, newId);
        this.subscriptions.push({ ...data, id: newId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
        this.showToast('Subscription created successfully');
      }
      this.overview.totalSubscriptions = this.subscriptions.length;
      this.overview.activeSubscriptions = this.subscriptions.filter(s => s.status === 'active').length;
      this.showSubForm = false;
      this.editingSub = null;
    } catch (e: any) { this.showToast('Failed to save: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  async deleteSub(sub: Subscription & { id: string }): Promise<void> {
    const ok = await this.showConfirm('Delete Subscription', `Delete "${sub.entity_name}"? This cannot be undone.`);
    if (!ok) return;
    this.isSaving = true;
    try {
      await this.superAdminService.deleteSubscription(sub.id);
      this.subscriptions = this.subscriptions.filter(s => s.id !== sub.id);
      this.overview.totalSubscriptions = this.subscriptions.length;
      this.showToast('Subscription deleted');
    } catch (e: any) { this.showToast('Failed to delete: ' + e.message, 'error'); }
    finally { this.isSaving = false; this.cdr.detectChanges(); }
  }

  private emptySubForm() {
    return {
      entity_name: '', owner_email: '', billing_email: '',
      plan_name: 'basic' as 'basic' | 'premium',
      max_clinics: 5, max_doctors: 10, max_appointments_per_day: 50,
      status: 'active' as 'active' | 'inactive' | 'suspended',
    };
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

  // ── Permissions ───────────────────────────────────────────────────────
  async savePermissions(): Promise<void> {
    this.isSaving = true;
    try {
      const dp = this.permissionDefs.filter(p => this.doctorPermissions[p.key]).map(p => p.key as string);
      const rp = this.permissionDefs.filter(p => this.receptionistPermissions[p.key]).map(p => p.key as string);
      await Promise.all([
        this.superAdminService.setRolePermissions('doctor', dp),
        this.superAdminService.setRolePermissions('receptionist', rp),
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
