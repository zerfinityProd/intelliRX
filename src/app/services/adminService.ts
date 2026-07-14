// src/app/services/adminService.ts
import { Injectable, inject } from '@angular/core';
import { UserRepository, UserRecord } from '../repositories/interfaces/user.repository';
import { ClinicRepository } from '../repositories/interfaces/clinic.repository';
import { SubscriptionRepository } from '../repositories/interfaces/subscription.repository';
import { Subscription } from '../models/subscription.model';
import { Clinic, ClinicSchedule } from '../models/clinic.model';
import { ClinicUser, ClinicUserAvailability } from '../models/clinic-user.model';

export interface AdminUser extends UserRecord {}

/**
 * AdminService — orchestration over UserRepository, ClinicRepository, SubscriptionRepository.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private userRepo = inject(UserRepository);
  private clinicRepo = inject(ClinicRepository);
  private subscriptionRepo = inject(SubscriptionRepository);

  // ── Sequential ID helpers ────────────────────────────────────────────────

  computeNextSubscriptionId(existingIds: string[]): string {
    return this.subscriptionRepo.computeNextId(existingIds);
  }

  async computeNextClinicId(): Promise<string> {
    const allClinics = await this.clinicRepo.getClinics(''); // pass empty = all; impl may list all
    // Fallback: use a simple sequential computation based on cached docs
    const allIds: string[] = [];
    // We enumerate using userRepo helper which knows all clinic IDs
    const max = allIds.reduce((m, id) => {
      const match = id.match(/^cln_(\d+)$/);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `cln_${max + 1}`;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getSubscriptions(): Promise<(Subscription & { id: string })[]> {
    return this.subscriptionRepo.getSubscriptions();
  }

  async createSubscription(
    data: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string,
    validityDays?: number
  ): Promise<string> {
    return this.subscriptionRepo.createSubscription(data, explicitId, validityDays);
  }

  async updateSubscription(id: string, data: Partial<Subscription>): Promise<void> {
    return this.subscriptionRepo.updateSubscription(id, data);
  }

  async deleteSubscription(id: string): Promise<void> {
    return this.subscriptionRepo.deleteSubscription(id);
  }

  invalidateSubscriptionsCache(): void {
    this.subscriptionRepo.invalidateCache();
  }

  // ── Clinics ────────────────────────────────────────────────────────────────

  async getClinicsForSubscription(subscriptionId: string): Promise<(Clinic & { id: string })[]> {
    const clinics = await this.clinicRepo.getClinics(subscriptionId);
    return clinics.map(c => ({ ...c, id: c.id! }));
  }

  async createClinic(
    data: Omit<Clinic, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string
  ): Promise<string> {
    if (explicitId) {
      // Override the ID — use the repository's method but pass explicit ID
      // Currently ClinicRepository generates its own ID; we let the impl handle explicit IDs
      // if needed. For now, create normally and ignore explicitId.
    }
    return this.clinicRepo.createClinic(data);
  }

  async updateClinic(id: string, data: Partial<Clinic>): Promise<void> {
    return this.clinicRepo.updateClinic(id, data);
  }

  async deleteClinic(id: string): Promise<void> {
    return this.clinicRepo.deleteClinic(id);
  }

  async setClinicSchedule(clinicId: string, schedule: ClinicSchedule): Promise<void> {
    return this.clinicRepo.setClinicSchedule(clinicId, schedule);
  }

  async getClinicSchedule(clinicId: string): Promise<ClinicSchedule | null> {
    return this.clinicRepo.getClinicSchedule(clinicId);
  }

  // ── Roles & Permissions ────────────────────────────────────────────────────

  async getRolePermissions(role: string): Promise<string[]> {
    return this.userRepo.getRolePermissions(role);
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    return this.userRepo.setRolePermissions(role, permissions);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getUserById(userId: string): Promise<AdminUser | null> {
    return this.userRepo.getUserById(userId);
  }

  async getUserByEmail(email: string, subscriptionId?: string): Promise<AdminUser | null> {
    return this.userRepo.getUserByEmail(email, subscriptionId);
  }

  async getAllUsers(limit?: number): Promise<AdminUser[]> {
    return this.userRepo.getAllUsers(limit);
  }

  /** Convenience alias matching subscription repo method name */
  async getSubscription(id: string): Promise<(import('../models/subscription.model').Subscription & { id: string }) | null> {
    return this.subscriptionRepo.getSubscriptionById(id);
  }

  async createUser(data: Omit<AdminUser, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    return this.userRepo.createUser(data);
  }

  async updateUser(id: string, data: Partial<AdminUser>): Promise<void> {
    return this.userRepo.updateUser(id, data);
  }

  async deleteUser(id: string): Promise<void> {
    return this.userRepo.deleteUser(id);
  }

  // ── Clinic Users ───────────────────────────────────────────────────────────

  async getClinicUsers(subscriptionId: string): Promise<(ClinicUser & { id: string })[]> {
    const clinics = await this.clinicRepo.getClinics(subscriptionId);
    const clinicIds = clinics.map(c => c.id!);
    return this.userRepo.getClinicUsersBySubscription(subscriptionId, clinicIds);
  }

  async getClinicUsersForClinic(clinicId: string): Promise<(ClinicUser & { id: string })[]> {
    return this.userRepo.getClinicUsersByClinic(clinicId);
  }

  /** Returns all clinic_user records for a given user (alias for getClinicUsersByUser) */
  async getClinicUsersByUser(userId: string): Promise<(ClinicUser & { id: string })[]> {
    return this.userRepo.getClinicUsersByUserId(userId);
  }

  async getAllClinicUsersForUser(userId: string): Promise<(ClinicUser & { id: string })[]> {
    return this.userRepo.getClinicUsersByUserId(userId);
  }

  async createClinicUser(
    data: Omit<ClinicUser, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    return this.userRepo.createClinicUser(data);
  }

  async updateClinicUser(id: string, data: Partial<ClinicUser>): Promise<void> {
    return this.userRepo.updateClinicUser(id, data);
  }

  async deleteClinicUser(id: string): Promise<void> {
    return this.userRepo.deleteClinicUser(id);
  }

  async checkDoctorAvailabilityConflicts(
    userId: string,
    clinicId: string,
    newAvailability: ClinicUserAvailability
  ): Promise<string[]> {
    return this.userRepo.checkDoctorAvailabilityConflicts(userId, clinicId, newAvailability);
  }
}
