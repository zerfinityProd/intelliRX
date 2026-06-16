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
   * Leaves are stored as: clinics/{clinicId}/leaves/{leaveId}
   * Covered by existing Firestore rule:
   *   match /clinics/{clinicId}/{document=**} { allow read, write: if request.auth != null; }
   */
  /** Parent document path — used as parentPath in runQuery */
  private clinicDocPath(clinicId: string): string {
    return `clinics/${clinicId}`;
  }
  /** Full collection path — used in createDocument and deleteDocument */
  private leavesColPath(clinicId: string): string {
    return `clinics/${clinicId}/leaves`;
  }

  /**
   * Get all leaves for the currently logged-in doctor at their selected clinic.
   * user_id is stored as normalized email — consistent with all lookup paths.
   */
  async getMyLeaves(): Promise<Leave[]> {
    const userEmail = normalizeEmail(this.auth.currentUserValue?.email || '');
    const clinicId = this.clinicContext.getSelectedClinicId();
    if (!userEmail || !clinicId) return [];

    const result = await this.api.runQuery(this.clinicDocPath(clinicId), {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id', op: '==', value: userEmail }
      ]
    });

    return result.map((doc: any) => ({
      id: doc.id,
      ...doc.data
    })) as Leave[];
  }

  /**
   * Get all leaves for a specific doctor on a specific date.
   * Used by timeSlotService for slot filtering.
   */
  async getDoctorLeaves(doctorId: string, clinicId: string, date: string): Promise<Leave[]> {
    const result = await this.api.runQuery(this.clinicDocPath(clinicId), {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id', op: '==', value: doctorId },
        { field: 'date', op: '==', value: date }
      ]
    });

    return result.map((doc: any) => ({
      id: doc.id,
      ...doc.data
    })) as Leave[];
  }

  /**
   * Create a leave record under clinics/{clinicId}/leaves/
   */
  async addLeave(leave: Omit<Leave, 'id' | 'created_at'>): Promise<string> {
    const id = await this.api.createDocument(
      this.leavesColPath(leave.clinic_id),
      {
        ...leave,
        created_at: new Date().toISOString()
      }
    );
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
   */
  async isDoctorOnLeave(
    doctorId: string, clinicId: string, date: string, timingLabel?: string
  ): Promise<{ onLeave: boolean; leaveType: string; leaves: Leave[] } | null> {
    const approved = await this.getApprovedLeavesForDate(doctorId, clinicId, date);
    if (approved.length === 0) return null;

    // Check for All Day leave first (blocks everything)
    const allDayLeave = approved.find(l => l.timing === 'All Day');
    if (allDayLeave) {
      return { onLeave: true, leaveType: 'All Day', leaves: approved };
    }

    // If a specific timing label was requested, check for a matching half-day leave
    if (timingLabel) {
      const matchingLeave = approved.find(
        l => l.timing.toUpperCase() === timingLabel.toUpperCase()
      );
      if (matchingLeave) {
        return { onLeave: true, leaveType: matchingLeave.timing, leaves: approved };
      }
      return null;
    }

    // No specific timing — return info about all approved leaves
    const leaveTypes = [...new Set(approved.map(l => l.timing))];
    return {
      onLeave: true,
      leaveType: leaveTypes.join(', '),
      leaves: approved
    };
  }

  async deleteLeave(id: string, clinicId?: string): Promise<void> {
    const cid = clinicId || this.clinicContext.getSelectedClinicId() || '';
    await this.api.deleteDocument(this.leavesColPath(cid), id);
  }
}
