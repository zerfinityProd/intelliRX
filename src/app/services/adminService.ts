// src/app/services/adminService.ts
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { Subscription } from '../models/subscription.model';
import { Clinic, ClinicSchedule } from '../models/clinic.model';
import { ClinicUser, ClinicUserAvailability } from '../models/clinic-user.model';

export interface AdminUser {
  id?: string;
  email: string;
  name: string;
  specialization?: string;
  global_roles: string[];
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private api = inject(FirestoreApiService);

  // ── Subscription cache ────────────────────────────────────────────────────

  private _subsCache: (Subscription & { id: string })[] | null = null;
  private _subsFetchPromise: Promise<(Subscription & { id: string })[]> | null = null;

  /** Invalidate the subscription cache (call after create/delete). */
  invalidateSubscriptionsCache(): void {
    this._subsCache = null;
    this._subsFetchPromise = null;
  }

  // ── Sequential ID helpers (synchronous — pass your local list) ────────────

  /**
   * Given a list of existing subscription IDs, returns the next sequential ID
   * in the format sub_01, sub_02 … zero-padded to at least 2 digits.
   * Call with your locally cached list to avoid any extra network round-trip.
   */
  computeNextSubscriptionId(existingIds: string[]): string {
    const max = existingIds.reduce((m, id) => {
      const match = id.match(/^sub_(\d+)$/);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `sub_${String(max + 1).padStart(2, '0')}`;
  }

  /**
   * Given a list of existing clinic IDs, returns the next sequential ID
   * in the format clinic_01, clinic_02 … zero-padded to at least 2 digits.
   * Call with your locally cached list to avoid any extra network round-trip.
   */
  computeNextClinicId(existingIds: string[]): string {
    const max = existingIds.reduce((m, id) => {
      const match = id.match(/^clinic_(\d+)$/);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `clinic_${String(max + 1).padStart(2, '0')}`;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getSubscriptions(): Promise<(Subscription & { id: string })[]> {
    // Return cached result instantly
    if (this._subsCache) return [...this._subsCache];

    // Deduplicate concurrent callers — only one Firestore fetch in flight
    if (!this._subsFetchPromise) {
      this._subsFetchPromise = this.api
        .listDocuments('subscriptions', 500)
        .then(docs => {
          this._subsCache = docs.map(d => ({ ...(d.data as Subscription), id: d.id }));
          this._subsFetchPromise = null;
          return [...this._subsCache];
        })
        .catch(err => {
          this._subsFetchPromise = null;
          throw err;
        });
    }

    return this._subsFetchPromise;
  }

  async createSubscription(
    data: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string
  ): Promise<string> {
    const id = explicitId ?? this.api.generateDocId();
    const now = new Date().toISOString();
    await this.api.setDocument('subscriptions', id, {
      ...data,
      created_at: now,
      updated_at: now,
    });
    this.invalidateSubscriptionsCache();
    return id;
  }

  async updateSubscription(id: string, data: Partial<Subscription>): Promise<void> {
    await this.api.updateDocument('subscriptions', id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.api.deleteDocument('subscriptions', id);
    this.invalidateSubscriptionsCache();
  }

  // ── Clinics ────────────────────────────────────────────────────────────────

  async getClinicsForSubscription(subscriptionId: string): Promise<(Clinic & { id: string })[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinics',
      filters: [{ field: 'subscription_id', op: '==', value: subscriptionId }],
    });
    return docs.map(d => ({ ...(d.data as Clinic), id: d.id }));
  }

  async createClinic(
    data: Omit<Clinic, 'id' | 'created_at' | 'updated_at'>,
    explicitId?: string
  ): Promise<string> {
    const id = explicitId ?? this.api.generateDocId();
    const now = new Date().toISOString();
    const { schedule, ...rest } = data;
    await this.api.setDocument('clinics', id, {
      ...rest,
      created_at: now,
      updated_at: now,
    });
    if (schedule) await this.setClinicSchedule(id, schedule);
    return id;
  }

  async updateClinic(id: string, data: Partial<Clinic>): Promise<void> {
    const { schedule, ...rest } = data as any;
    if (Object.keys(rest).length > 0) {
      await this.api.updateDocument('clinics', id, {
        ...rest,
        updated_at: new Date().toISOString(),
      });
    }
    if (schedule) await this.setClinicSchedule(id, schedule);
  }

  async deleteClinic(id: string): Promise<void> {
    await this.api.deleteDocument('clinics', id);
  }

  async setClinicSchedule(clinicId: string, schedule: ClinicSchedule): Promise<void> {
    await this.api.setDocument(`clinics/${clinicId}/schedule`, 'schedule', schedule);
  }

  async getClinicSchedule(clinicId: string): Promise<ClinicSchedule | null> {
    const result = await this.api.getDocument(`clinics/${clinicId}/schedule`, 'schedule');
    return result ? (result.data as ClinicSchedule) : null;
  }

  // ── Roles & Permissions ────────────────────────────────────────────────────

  async getRolePermissions(role: string): Promise<string[]> {
    const doc = await this.api.getDocument('roles', role);
    if (!doc) return [];
    if (Array.isArray(doc.data.permissions)) return doc.data.permissions;
    // Legacy: the document value itself may be an array or the first key's value
    if (Array.isArray(doc.data)) return doc.data;
    const keys = Object.keys(doc.data);
    if (keys.length > 0 && Array.isArray(doc.data[keys[0]])) return doc.data[keys[0]];
    return [];
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    await this.api.setDocument('roles', role, { permissions });
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getUserById(userId: string): Promise<AdminUser | null> {
    const doc = await this.api.getDocument('users', userId);
    return doc ? ({ ...doc.data, id: doc.id } as AdminUser) : null;
  }

  async getUserByEmail(email: string): Promise<AdminUser | null> {
    const normalized = email.toLowerCase().trim();
    const docs = await this.api.runQuery('', {
      collectionId: 'users',
      filters: [{ field: 'email', op: '==', value: normalized }],
    });
    return docs.length > 0 ? ({ ...docs[0].data, id: docs[0].id } as AdminUser) : null;
  }

  async createUser(
    data: Omit<AdminUser, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    const id = this.api.generateDocId();
    const now = new Date().toISOString();
    await this.api.setDocument('users', id, {
      ...data,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  async updateUser(id: string, data: Partial<AdminUser>): Promise<void> {
    await this.api.updateDocument('users', id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.api.deleteDocument('users', id);
  }

  // ── Clinic Users ───────────────────────────────────────────────────────────

  async getClinicUsers(subscriptionId: string): Promise<(ClinicUser & { id: string })[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'subscription_id', op: '==', value: subscriptionId }],
    });
    return docs.map(d => ({ ...(d.data as ClinicUser), id: d.id }));
  }

  async getClinicUsersForClinic(clinicId: string): Promise<(ClinicUser & { id: string })[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'clinic_id', op: '==', value: clinicId }],
    });
    return docs.map(d => ({ ...(d.data as ClinicUser), id: d.id }));
  }

  /**
   * Fetch ALL clinic_user records for a given user across every subscription.
   * Used for cross-subscription scheduling conflict detection.
   */
  async getAllClinicUsersForUser(userId: string): Promise<(ClinicUser & { id: string })[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'user_id', op: '==', value: userId }],
    });
    return docs.map(d => ({ ...(d.data as ClinicUser), id: d.id }));
  }

  async createClinicUser(
    data: Omit<ClinicUser, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    const id = this.api.generateDocId();
    const now = new Date().toISOString();
    const payload: any = {
      ...data,
      created_at: now,
      updated_at: now,
    };
    // Remove undefined availability
    if (payload.availability === undefined) delete payload.availability;
    await this.api.setDocument('clinic_users', id, payload);
    return id;
  }

  async updateClinicUser(id: string, data: Partial<ClinicUser>): Promise<void> {
    const payload: any = { ...data, updated_at: new Date().toISOString() };
    if (payload.availability === undefined) delete payload.availability;
    await this.api.updateDocument('clinic_users', id, payload);
  }

  async deleteClinicUser(id: string): Promise<void> {
    await this.api.deleteDocument('clinic_users', id);
  }

  /**
   * Check if a doctor's proposed availability for a clinic conflicts with
   * their availability at other clinics in the same subscription.
   *
   * A conflict is when the doctor is marked available on the same day AND
   * the same time-block label at two different clinics simultaneously.
   *
   * Returns human-readable conflict strings (empty array = no conflicts).
   */
  async checkDoctorAvailabilityConflicts(
    userId: string,
    clinicId: string,
    newAvailability: ClinicUserAvailability,
    subscriptionId: string
  ): Promise<string[]> {
    const conflicts: string[] = [];

    const allCuDocs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [
        { field: 'user_id', op: '==', value: userId },
        { field: 'subscription_id', op: '==', value: subscriptionId },
      ],
    });

    // Exclude the clinic currently being configured
    const otherCuDocs = allCuDocs.filter(d => d.data['clinic_id'] !== clinicId);

    for (const cuDoc of otherCuDocs) {
      const otherAvail: ClinicUserAvailability = cuDoc.data['availability'] || {};
      const otherClinicId: string = cuDoc.data['clinic_id'] || '(unknown clinic)';

      for (const day of Object.keys(newAvailability)) {
        const newBlocks: string[] = newAvailability[day] || [];
        const otherBlocks: string[] = otherAvail[day] || [];
        const overlapping = newBlocks.filter(b => otherBlocks.includes(b));

        if (overlapping.length > 0) {
          conflicts.push(
            `${day}: Doctor already assigned to clinic "${otherClinicId}" for block(s) [${overlapping.join(', ')}]`
          );
        }
      }
    }

    return conflicts;
  }
}
