// src/app/services/superAdminService.ts
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { Subscription } from '../models/subscription.model';
import { AdminService } from './adminService';

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

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private api = inject(FirestoreApiService);
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

  computeNextSubscriptionId(existingIds: string[]): string {
    return this.adminService.computeNextSubscriptionId(existingIds);
  }

  // ── Admin Users ────────────────────────────────────────────────────────────

  /** Fetch all users who have 'admin' in global_roles */
  async getAdminUsers(): Promise<SuperAdminUser[]> {
    const docs = await this.api.listDocuments('users', 500);
    return docs
      .map(d => ({ ...d.data, id: d.id } as SuperAdminUser))
      .filter(u => (u.global_roles || []).includes('admin'));
  }

  /** Fetch all users (for overview stats) */
  async getAllUsers(): Promise<SuperAdminUser[]> {
    const docs = await this.api.listDocuments('users', 500);
    return docs.map(d => ({ ...d.data, id: d.id } as SuperAdminUser));
  }

  /** Create a new admin user with a subscription pre-assigned */
  async createAdminUser(data: {
    email: string;
    name: string;
    subscription_id: string;
  }): Promise<string> {
    const id = this.api.generateDocId();
    const now = new Date().toISOString();
    await this.api.setDocument('users', id, {
      email: data.email.trim().toLowerCase(),
      name: data.name.trim(),
      global_roles: ['admin'],
      subscription_id: data.subscription_id,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  /** Update admin user fields */
  async updateAdminUser(id: string, data: Partial<SuperAdminUser>): Promise<void> {
    await this.api.updateDocument('users', id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  }

  /** Delete a user document */
  async deleteAdminUser(id: string): Promise<void> {
    await this.api.deleteDocument('users', id);
  }

  /**
   * Assign a subscription to an admin user.
   * Sets the subscription_id field on their user doc.
   */
  async assignSubscriptionToAdmin(userId: string, subscriptionId: string): Promise<void> {
    await this.api.updateDocument('users', userId, {
      subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    });
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
    const [allSubs, allUsers, clinicDocs] = await Promise.all([
      this.getAllSubscriptions(),
      this.getAllUsers(),
      this.api.listDocuments('clinics', 500),
    ]);

    const activeSubscriptions = allSubs.filter(s => s.status === 'active').length;
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
      totalClinics: clinicDocs.length,
      totalUsers: allUsers.length,
    };
  }
}
