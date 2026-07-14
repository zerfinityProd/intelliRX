// src/app/services/superAdminService.ts
import { Injectable, inject } from '@angular/core';
import { UserRepository } from '../repositories/interfaces/user.repository';
import { ClinicRepository } from '../repositories/interfaces/clinic.repository';
import { AdminService } from './adminService';
import { Subscription } from '../models/subscription.model';

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

/**
 * SuperAdminService — orchestration over UserRepository and AdminService.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private userRepo = inject(UserRepository);
  private clinicRepo = inject(ClinicRepository);
  private adminService = inject(AdminService);

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getAllSubscriptions(): Promise<(Subscription & { id: string })[]> {
    return this.adminService.getSubscriptions();
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

  // ── Dashboard Overview ────────────────────────────────────────────────────

  async getDashboardOverview(): Promise<DashboardOverview> {
    const [allSubs, allUsers, allClinics] = await Promise.all([
      this.getAllSubscriptions(),
      this.getAllUsers(),
      this.clinicRepo.getClinics(''),
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
