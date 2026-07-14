// src/app/repositories/interfaces/user.repository.ts
import { ClinicUser, ClinicUserAvailability } from '../../models/clinic-user.model';

export interface UserRecord {
  id?: string;
  email: string;
  name: string;
  specialization?: string;
  global_roles: string[];
  status: 'active' | 'inactive';
  subscription_id?: string;
  notification_permission?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserQueryFilter {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';
  value: any;
}

/**
 * Abstract token for users + clinic_users + roles data access.
 */
export abstract class UserRepository {
  // ── Users ──────────────────────────────────────────────────

  abstract getUserById(userId: string): Promise<UserRecord | null>;

  abstract getUserByEmail(
    email: string,
    subscriptionId?: string
  ): Promise<UserRecord | null>;

  abstract getUsersByFilter(
    filters: UserQueryFilter[]
  ): Promise<UserRecord[]>;

  abstract getAllUsers(limit?: number): Promise<UserRecord[]>;

  abstract createUser(
    data: Omit<UserRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string>;

  abstract updateUser(id: string, data: Partial<UserRecord>): Promise<void>;

  abstract deleteUser(id: string): Promise<void>;

  // ── Roles ──────────────────────────────────────────────────

  abstract getRolePermissions(role: string): Promise<string[]>;

  abstract setRolePermissions(role: string, permissions: string[]): Promise<void>;

  // ── Clinic Users ───────────────────────────────────────────

  abstract getClinicUsersBySubscription(
    subscriptionId: string,
    clinicIds: string[]
  ): Promise<(ClinicUser & { id: string })[]>;

  abstract getClinicUsersByClinic(
    clinicId: string
  ): Promise<(ClinicUser & { id: string })[]>;

  abstract getClinicUsersByUserId(
    userId: string
  ): Promise<(ClinicUser & { id: string })[]>;

  abstract createClinicUser(
    data: Omit<ClinicUser, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string>;

  abstract updateClinicUser(
    id: string,
    data: Partial<ClinicUser>
  ): Promise<void>;

  abstract deleteClinicUser(id: string): Promise<void>;

  abstract checkDoctorAvailabilityConflicts(
    userId: string,
    clinicId: string,
    newAvailability: ClinicUserAvailability
  ): Promise<string[]>;

  // ── Next ID helpers ────────────────────────────────────────

  abstract getNextUserId(): Promise<string>;

  abstract getNextClinicUserId(): Promise<string>;

  abstract computeNextClinicId(allClinicDocs: string[]): string;
}
