// src/app/repositories/interfaces/leave.repository.ts
import { Leave } from '../../models/leave.model';

/**
 * Abstract token for leave data access.
 */
export abstract class LeaveRepository {
  abstract getLeavesByUserAndClinic(
    userEmail: string,
    clinicId: string
  ): Promise<Leave[]>;

  abstract getDoctorLeaves(
    doctorId: string,
    clinicId: string,
    date: string
  ): Promise<Leave[]>;

  abstract addLeave(leave: Omit<Leave, 'id' | 'created_at'>): Promise<string>;

  abstract deleteLeave(id: string): Promise<void>;
}
