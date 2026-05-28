import { Injectable } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { Leave } from '../models/leave.model';
import { ClinicContextService } from './clinicContextService';
import { AuthenticationService } from './authenticationService';

@Injectable({
  providedIn: 'root'
})
export class LeaveService {
  constructor(
    private api: FirestoreApiService,
    private clinicContext: ClinicContextService,
    private auth: AuthenticationService
  ) {}

  async getMyLeaves(): Promise<Leave[]> {
    const userId = this.auth.getCurrentUserId();
    const clinicId = this.clinicContext.getSelectedClinicId();
    if (!userId || !clinicId) return [];

    const result = await this.api.runQuery('', {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id', op: '==', value: userId },
        { field: 'clinic_id', op: '==', value: clinicId }
      ]
    });

    return result.map((doc: any) => ({
      id: doc.id,
      ...doc.data
    })) as Leave[];
  }

  async getDoctorLeaves(doctorId: string, clinicId: string, date: string): Promise<Leave[]> {
    const result = await this.api.runQuery('', {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id', op: '==', value: doctorId },
        { field: 'clinic_id', op: '==', value: clinicId },
        { field: 'date', op: '==', value: date }
      ]
    });

    return result.map((doc: any) => ({
      id: doc.id,
      ...doc.data
    })) as Leave[];
  }

  async addLeave(leave: Omit<Leave, 'id' | 'created_at'>): Promise<string> {
    const id = this.api.generateDocId();
    await this.api.setDocument('leaves', id, {
      ...leave,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async deleteLeave(id: string): Promise<void> {
    await this.api.deleteDocument('leaves', id);
  }
}
