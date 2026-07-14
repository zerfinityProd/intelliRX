// src/app/repositories/firebase/firebase-user.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR USER / CLINIC_USER / ROLES DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService, QueryFilter, DELETE_FIELD } from './firestore-api.service';
import { UserRepository, UserRecord, UserQueryFilter } from '../interfaces/user.repository';
import { ClinicUser, ClinicUserAvailability } from '../../models/clinic-user.model';

@Injectable()
export class FirebaseUserRepository extends UserRepository {
  private api = inject(FirestoreApiService);

  // ── Users ──────────────────────────────────────────────────

  async getUserById(userId: string): Promise<UserRecord | null> {
    const doc = await this.api.getDocument('users', userId);
    return doc ? ({ ...doc.data, id: doc.id } as UserRecord) : null;
  }

  async getUserByEmail(email: string, subscriptionId?: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase().trim();
    const filters: QueryFilter[] = [{ field: 'email', op: '==', value: normalized }];
    if (subscriptionId) {
      filters.push({ field: 'subscription_id', op: '==', value: subscriptionId });
    }
    const docs = await this.api.runQuery('', { collectionId: 'users', filters });
    return docs.length > 0 ? ({ ...docs[0].data, id: docs[0].id } as UserRecord) : null;
  }

  async getUsersByFilter(filters: UserQueryFilter[]): Promise<UserRecord[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'users',
      filters: filters as QueryFilter[],
    });
    return docs.map(d => ({ ...d.data, id: d.id } as UserRecord));
  }

  async getAllUsers(limit = 300): Promise<UserRecord[]> {
    const docs = await this.api.listDocuments('users', limit);
    return docs.map(d => ({ ...d.data, id: d.id } as UserRecord));
  }

  async createUser(data: Omit<UserRecord, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    const id = await this.api.getNextSequentialId('usr');
    const now = new Date().toISOString();
    await this.api.setDocument('users', id, { ...data, created_at: now, updated_at: now });
    return id;
  }

  async updateUser(id: string, data: Partial<UserRecord>): Promise<void> {
    await this.api.updateDocument('users', id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.api.deleteDocument('users', id);
  }

  // ── Roles ──────────────────────────────────────────────────

  async getRolePermissions(role: string): Promise<string[]> {
    const doc = await this.api.getDocument('roles', role);
    if (!doc) return [];
    const data = doc.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data['permissions'])) return data['permissions'];
    const keys = Object.keys(data);
    if (keys.length > 0 && Array.isArray(data[keys[0]])) return data[keys[0]];
    return [];
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    await this.api.setDocument('roles', role, { permissions });
  }

  // ── Clinic Users ───────────────────────────────────────────

  async getClinicUsersBySubscription(
    subscriptionId: string,
    clinicIds: string[]
  ): Promise<(ClinicUser & { id: string })[]> {
    const allResults: (ClinicUser & { id: string })[] = [];
    const seenIds = new Set<string>();
    for (const clinicId of clinicIds) {
      const docs = await this.api.runQuery('', {
        collectionId: 'clinic_users',
        filters: [{ field: 'clinic_id', op: '==', value: clinicId }],
      });
      for (const d of docs) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          allResults.push({ ...(d.data as ClinicUser), id: d.id });
        }
      }
    }
    return allResults;
  }

  async getClinicUsersByClinic(clinicId: string): Promise<(ClinicUser & { id: string })[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'clinic_id', op: '==', value: clinicId }],
    });
    return docs.map(d => ({ ...(d.data as ClinicUser), id: d.id }));
  }

  async getClinicUsersByUserId(userId: string): Promise<(ClinicUser & { id: string })[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'user_id', op: '==', value: userId }],
    });
    return docs.map(d => ({ ...(d.data as ClinicUser), id: d.id }));
  }

  async createClinicUser(data: Omit<ClinicUser, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    const id = await this.api.getNextSequentialId('clu');
    const now = new Date().toISOString();
    const payload: any = { ...data, created_at: now, updated_at: now };
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

  async checkDoctorAvailabilityConflicts(
    userId: string,
    clinicId: string,
    newAvailability: ClinicUserAvailability
  ): Promise<string[]> {
    const conflicts: string[] = [];
    const allCuDocs = await this.api.runQuery('', {
      collectionId: 'clinic_users',
      filters: [{ field: 'user_id', op: '==', value: userId }],
    });
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

  // ── Next ID helpers ────────────────────────────────────────

  async getNextUserId(): Promise<string> {
    return this.api.getNextSequentialId('usr');
  }

  async getNextClinicUserId(): Promise<string> {
    return this.api.getNextSequentialId('clu');
  }

  computeNextClinicId(allClinicDocIds: string[]): string {
    const max = allClinicDocIds.reduce((m, id) => {
      const match = id.match(/^cln_(\d+)$/);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `cln_${max + 1}`;
  }
}

