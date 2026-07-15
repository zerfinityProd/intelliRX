// src/app/services/leave.ts
import { Injectable, inject } from '@angular/core';
import { LeaveRepository } from '../repositories/interfaces/leave.repository';
import { Leave } from '../models/leave.model';
import { ClinicContextService } from './clinicContextService';
import { AuthenticationService } from './authenticationService';
import { normalizeEmail } from '../utilities/normalize-email';

/**
 * LeaveService — thin orchestration layer over LeaveRepository.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({
  providedIn: 'root'
})
export class LeaveService {
  private leaveRepo = inject(LeaveRepository);
  private clinicContext = inject(ClinicContextService);
  private auth = inject(AuthenticationService);

  async getMyLeaves(): Promise<Leave[]> {
    const rawEmail = this.auth.currentUserValue?.email
      || '';
    const userEmail = normalizeEmail(rawEmail);
    const clinicId = this.clinicContext.getSelectedClinicId();
    if (!userEmail || !clinicId) return [];
    return this.leaveRepo.getLeavesByUserAndClinic(userEmail, clinicId);
  }

  async getDoctorLeaves(doctorId: string, clinicId: string, date: string): Promise<Leave[]> {
    return this.leaveRepo.getDoctorLeaves(doctorId, clinicId, date);
  }

  async addLeave(leave: Omit<Leave, 'id' | 'created_at'>): Promise<string> {
    return this.leaveRepo.addLeave(leave);
  }

  async getApprovedLeavesForDate(
    doctorId: string, clinicId: string, date: string
  ): Promise<Leave[]> {
    const all = await this.getDoctorLeaves(doctorId, clinicId, date);
    return all.filter(l => l.status === 'approved');
  }

  async isDoctorOnLeave(
    doctorId: string, clinicId: string, date: string, timingLabel?: string
  ): Promise<{ onLeave: boolean; leaveType: string; leaves: Leave[] } | null> {
    const approved = await this.getApprovedLeavesForDate(doctorId, clinicId, date);
    if (approved.length === 0) return null;

    const allDayLeave = approved.find(l => l.timing === 'All Day');
    if (allDayLeave) return { onLeave: true, leaveType: 'All Day', leaves: approved };

    if (timingLabel) {
      const matchingLeave = approved.find(l => l.timing.toUpperCase() === timingLabel.toUpperCase());
      if (matchingLeave) return { onLeave: true, leaveType: matchingLeave.timing, leaves: approved };
      return null;
    }

    const leaveTypes = [...new Set(approved.map(l => l.timing))];
    return { onLeave: true, leaveType: leaveTypes.join(', '), leaves: approved };
  }

  async deleteLeave(id: string): Promise<void> {
    await this.leaveRepo.deleteLeave(id);
  }
}

