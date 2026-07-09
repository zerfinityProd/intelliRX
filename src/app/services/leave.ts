import { Injectable } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { Leave } from '../models/leave.model';
import { ClinicContextService } from './clinicContextService';
import { AuthenticationService } from './authenticationService';
import { normalizeEmail } from '../utilities/normalize-email';

@Injectable({
  providedIn: 'root'
})
export class LeaveService {
  constructor(
    private api: FirestoreApiService,
    private clinicContext: ClinicContextService,
    private auth: AuthenticationService
  ) {}

  /**
   * Leaves are stored in the top-level `leaves` collection.
   * Document ID format: lv_1, lv_2, lv_3 … (consistent with
   * sub_1, usr_1, apt_1, vst_1, cln_1, pat_1, clu_1).
   *
   * Each document contains:
   *   id        — lv_N
   *   user_id   — normalized email of the doctor/staff
   *   clinic_id — the clinic ID (e.g. cln_1)
   *   date      — YYYY-MM-DD
   *   timing    — 'All Day' | 'FH' | 'SH'
   *   status    — 'approved' | 'pending' | 'rejected'
   *   created_at — ISO datetime
   *
   * Firestore rule required (add in Firebase Console):
   *   match /leaves/{leaveId} {
   *     allow read, write: if request.auth != null;
   *   }
   */

  /**
   * Get all leaves for the currently logged-in user at their selected clinic.
   * Filters by normalized email (user_id) + clinic_id.
   */
  async getMyLeaves(): Promise<Leave[]> {
    // Use currentUserValue email first (full user object), fall back to
    // Firebase Auth's currentUser.email which is available immediately
    // from cache — before the Firestore role-lookup pipeline completes.
    const rawEmail = this.auth.currentUserValue?.email
                  || this.auth.getFirebaseUserEmail()
                  || '';
    const userEmail = normalizeEmail(rawEmail);
    const clinicId = this.clinicContext.getSelectedClinicId();
    if (!userEmail || !clinicId) return [];

    const result = await this.api.runQuery('', {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id',   op: '==', value: userEmail },
        { field: 'clinic_id', op: '==', value: clinicId }
      ]
    });

    return result.map((doc: any) => ({
      id: doc.id,
      ...doc.data
    })) as Leave[];
  }

  /**
   * Get all leaves for a specific doctor on a specific date at a clinic.
   * Used by TimeSlotService for slot-level leave filtering.
   */
  async getDoctorLeaves(doctorId: string, clinicId: string, date: string): Promise<Leave[]> {
    const result = await this.api.runQuery('', {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id',   op: '==', value: doctorId },
        { field: 'clinic_id', op: '==', value: clinicId },
        { field: 'date',      op: '==', value: date }
      ]
    });

    return result.map((doc: any) => ({
      id: doc.id,
      ...doc.data
    })) as Leave[];
  }

  /**
   * Create a leave record in the top-level `leaves` collection.
   * Uses the next sequential lv_N ID.
   */
  async addLeave(leave: Omit<Leave, 'id' | 'created_at'>): Promise<string> {
    const id = await this.api.getNextSequentialId('lv');
    await this.api.setDocument('leaves', id, {
      ...leave,
      id,
      created_at: new Date().toISOString()
    });
    return id;
  }

  /**
   * Get all approved leaves for a doctor at a clinic on a specific date.
   */
  async getApprovedLeavesForDate(
    doctorId: string, clinicId: string, date: string
  ): Promise<Leave[]> {
    const all = await this.getDoctorLeaves(doctorId, clinicId, date);
    return all.filter(l => l.status === 'approved');
  }

  /**
   * Check whether a doctor is on approved leave for a given date and optional timing.
   * Returns null if the doctor has no approved leave on that date.
   */
  async isDoctorOnLeave(
    doctorId: string, clinicId: string, date: string, timingLabel?: string
  ): Promise<{ onLeave: boolean; leaveType: string; leaves: Leave[] } | null> {
    const approved = await this.getApprovedLeavesForDate(doctorId, clinicId, date);
    if (approved.length === 0) return null;

    // All Day leave blocks every slot
    const allDayLeave = approved.find(l => l.timing === 'All Day');
    if (allDayLeave) {
      return { onLeave: true, leaveType: 'All Day', leaves: approved };
    }

    // Half-day: check if the requested timing slot is blocked
    if (timingLabel) {
      const matchingLeave = approved.find(
        l => l.timing.toUpperCase() === timingLabel.toUpperCase()
      );
      if (matchingLeave) {
        return { onLeave: true, leaveType: matchingLeave.timing, leaves: approved };
      }
      return null;
    }

    // No specific timing requested — return info about all approved leaves
    const leaveTypes = [...new Set(approved.map(l => l.timing))];
    return {
      onLeave: true,
      leaveType: leaveTypes.join(', '),
      leaves: approved
    };
  }

  /**
   * Delete a leave document from the top-level `leaves` collection.
   */
  async deleteLeave(id: string): Promise<void> {
    await this.api.deleteDocument('leaves', id);
  }
}
