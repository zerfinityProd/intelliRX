// src/app/repositories/firebase/firebase-leave.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR LEAVE DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { LeaveRepository } from '../interfaces/leave.repository';
import { Leave } from '../../models/leave.model';

@Injectable()
export class FirebaseLeaveRepository extends LeaveRepository {
  private api = inject(FirestoreApiService);

  async getLeavesByUserAndClinic(userEmail: string, clinicId: string): Promise<Leave[]> {
    const result = await this.api.runQuery('', {
      collectionId: 'leaves',
      filters: [
        { field: 'user_id', op: '==', value: userEmail },
        { field: 'clinic_id', op: '==', value: clinicId }
      ]
    });
    return result.map((doc: any) => ({ id: doc.id, ...doc.data })) as Leave[];
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
    return result.map((doc: any) => ({ id: doc.id, ...doc.data })) as Leave[];
  }

  async addLeave(leave: Omit<Leave, 'id' | 'created_at'>): Promise<string> {
    const id = await this.api.getNextSequentialId('lv');
    await this.api.setDocument('leaves', id, {
      ...leave,
      id,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async deleteLeave(id: string): Promise<void> {
    await this.api.deleteDocument('leaves', id);
  }
}

