import { Injectable, inject } from '@angular/core';
import { UserRepository } from '../repositories/interfaces/user.repository';
import { ClinicRepository } from '../repositories/interfaces/clinic.repository';
import { SubscriptionRepository } from '../repositories/interfaces/subscription.repository';
import { PlanRepository } from '../repositories/interfaces/plan.repository';
import { AdminService } from './adminService';
import { Subscription, PlanDetail } from '../models/subscription.model';

export interface SuperAdminUser {
  id?: string;
  email: string;
  name: string;
  global_roles: string[];
  subscription_id?: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface DashboardOverview {
  totalSubscriptions: number;
  activeSubscriptions: number;
  totalAdmins: number;
  totalDoctors: number;
  totalReceptionists: number;
  totalClinics: number;
  totalUsers: number;
}

/** A user doc cross-referenced with its subscription */
export interface UserWithSubscription {
  user: SuperAdminUser;
  subscription: (Subscription & { id: string }) | null;
}

/**
 * SuperAdminService — orchestration over UserRepository and AdminService.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private userRepo = inject(UserRepository);
  private clinicRepo = inject(ClinicRepository);
  private subscriptionRepo = inject(SubscriptionRepository);
  private planRepo = inject(PlanRepository);
  private adminService = inject(AdminService);

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getAllClinics(): Promise<any[]> {
    // getClinics(subId) queries WHERE subscription_id == subId.
    // We must call it once per subscription to get all clinics across the platform.
    const subs = await this.adminService.getSubscriptions();
    const arrays = await Promise.all(
      subs.filter(s => s.id).map(s => this.clinicRepo.getClinics(s.id!).catch(() => []))
    );
    return arrays.flat();
  }

  async getAllUsersRaw(): Promise<any[]> {
    return this.userRepo.getAllUsers(1000);
  }

  async getAllSubscriptions(): Promise<(Subscription & { id: string })[]> {
    const [raw, plans] = await Promise.all([
      this.adminService.getSubscriptions(),
      this.planRepo.listPlans().catch(() => [] as PlanDetail[]),
    ]);
    const planMap = new Map<string, PlanDetail>(plans.map(p => [p.key, p]));
    return raw.map(s => this.normalizeSub(s, planMap));
  }

  /**
   * Ensures every subscription has a well-formed `plan` object with real limits.
   *
   * Priority for limits:
   *   1. plans/{name} collection (authoritative — flat fields max_clinics etc.)
   *   2. Nested plan.limits inside the subscription doc (created by admin-setup flow)
   *   3. Flat top-level fields inside the subscription doc (legacy)
   *   4. Zero fallback
   */
  private normalizeSub(
    s: Subscription & { id: string },
    planMap: Map<string, PlanDetail>
  ): Subscription & { id: string } {
    const raw = s as any;

    // Resolve plan name — stored as a plain string ("pro") OR nested object ({ name: "pro" })
    const planName: string =
      (typeof s.plan === 'string' ? s.plan : null) ||   // ← Firestore stores plan as string
      (s.plan as any)?.name ||                           // ← or as { name: "pro", limits: {...} }
      raw['plan_name'] ||
      raw['planName'] ||
      '';

    // Look up authoritative plan details from plans collection
    const planDetail = planName ? planMap.get(planName.toLowerCase()) : undefined;

    const limits = {
      max_clinics:
        planDetail?.max_clinics ??
        s.plan?.limits?.max_clinics ??
        raw['max_clinics'] ??
        0,
      max_doctors:
        planDetail?.max_doctors ??
        s.plan?.limits?.max_doctors ??
        raw['max_doctors'] ??
        0,
      max_receptionists:
        planDetail?.max_receptionists ??
        s.plan?.limits?.max_receptionists ??
        raw['max_receptionists'] ??
        0,
      max_appointments_per_day:
        (planDetail as any)?.max_appointments_per_day ??
        s.plan?.limits?.max_appointments_per_day ??
        raw['max_appointments_per_day'] ??
        0,
    };

    return { ...s, plan: { name: planName, limits } };
  }

  async createSubscription(
    data: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string,
    validityDays?: number
  ): Promise<string> {
    return this.adminService.createSubscription(data, explicitId, validityDays);
  }

  async updateSubscription(id: string, data: Partial<Subscription>): Promise<void> {
    return this.adminService.updateSubscription(id, data);
  }

  async deleteSubscription(id: string): Promise<void> {
    return this.adminService.deleteSubscription(id);
  }

  async updateSubscriptionStatus(id: string, status: string): Promise<void> {
    return this.adminService.updateSubscription(id, { status } as any);
  }

  computeNextSubscriptionId(existingIds: string[]): string {
    return this.adminService.computeNextSubscriptionId(existingIds);
  }

  // ── Admin Users ────────────────────────────────────────────────────────────

  async getAdminUsers(): Promise<SuperAdminUser[]> {
    const allUsers = await this.userRepo.getAllUsers(500);
    return allUsers
      .map(u => u as SuperAdminUser)
      .filter(u => (u.global_roles || []).includes('admin'));
  }

  async getAllUsers(): Promise<SuperAdminUser[]> {
    const allUsers = await this.userRepo.getAllUsers(500);
    return allUsers.map(u => u as SuperAdminUser);
  }

  async createAdminUser(data: {
    email: string;
    name: string;
    subscription_id: string;
  }): Promise<string> {
    return this.userRepo.createUser({
      email: data.email.trim().toLowerCase(),
      name: data.name.trim(),
      global_roles: ['admin'],
      subscription_id: data.subscription_id,
      status: 'active',
    });
  }

  async updateAdminUser(id: string, data: Partial<SuperAdminUser>): Promise<void> {
    return this.userRepo.updateUser(id, data as any);
  }

  async deleteAdminUser(id: string): Promise<void> {
    return this.userRepo.deleteUser(id);
  }

  async assignSubscriptionToAdmin(userId: string, subscriptionId: string): Promise<void> {
    return this.userRepo.updateUser(userId, { subscription_id: subscriptionId } as any);
  }

  // ── Role Permissions ────────────────────────────────────────────────────────

  async getRolePermissions(role: string): Promise<string[]> {
    return this.adminService.getRolePermissions(role);
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    return this.adminService.setRolePermissions(role, permissions);
  }

  // ── User ↔ Subscription cross-reference ──────────────────────────────────

  /**
   * Returns every user enriched with its linked subscription.
   * Matching priority:
   *   1. user.subscription_id field (fastest)
   *   2. subscriptions.owner_email === user.email (fallback for owners)
   */
  async getAllUsersWithSubscriptions(): Promise<UserWithSubscription[]> {
    const [allUsers, allSubs] = await Promise.all([
      this.getAllUsers(),
      this.getAllSubscriptions(),
    ]);

    // Build a fast lookup map: subscriptionId → subscription
    const subById = new Map<string, Subscription & { id: string }>();
    for (const s of allSubs) subById.set(s.id, s);

    return allUsers.map(u => {
      const subId: string = (u as any).subscription_id || '';
      let sub: (Subscription & { id: string }) | null = null;

      if (subId) {
        sub = subById.get(subId) ?? null;
      }
      // Fallback: check owner_email
      if (!sub) {
        sub = allSubs.find(
          s => s.owner_email?.toLowerCase().trim() === u.email?.toLowerCase().trim()
        ) ?? null;
      }

      return { user: u, subscription: sub };
    });
  }

  /**
   * Update plan, status, and/or valid_until on a subscription.
   * Delegates to AdminService → SubscriptionRepository.
   */
  async updateSubscriptionDetails(
    subscriptionId: string,
    patch: Partial<Pick<Subscription, 'plan' | 'status' | 'valid_until'>>
  ): Promise<void> {
    return this.adminService.updateSubscription(subscriptionId, {
      ...patch,
      updated_at: new Date().toISOString(),
    } as any);
  }

  // ── Dashboard Overview ────────────────────────────────────────────────────

  async getDashboardOverview(): Promise<DashboardOverview> {
    const [allSubs, allUsers, allClinics] = await Promise.all([
      this.getAllSubscriptions(),
      this.getAllUsers(),
      this.getAllClinics(),   // ← fetches per subscription, not getClinics('')
    ]);

    const activeSubscriptions = allSubs.filter(s => (s as any).status === 'active').length;
    const totalAdmins = allUsers.filter(u => (u.global_roles || []).includes('admin')).length;
    const totalDoctors = allUsers.filter(u => (u.global_roles || []).includes('doctor')).length;
    const totalReceptionists = allUsers.filter(u =>
      (u.global_roles || []).includes('receptionist')
    ).length;

    return {
      totalSubscriptions: allSubs.length,
      activeSubscriptions,
      totalAdmins,
      totalDoctors,
      totalReceptionists,
      totalClinics: allClinics.length,
      totalUsers: allUsers.length,
    };
  }
}
