// src/app/services/appointmentService.ts
import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
  Timestamp
} from '@angular/fire/firestore';
import { AuthenticationService } from './authenticationService';
import { Appointment } from '../models/appointment.model';

@Injectable({ providedIn: 'root' })
export class AppointmentService {

  // In-memory cache — cleared when a new appointment is booked or status updated
  private cache: Appointment[] | null = null;

  constructor(
    private db: Firestore,
    private authService: AuthenticationService
  ) {}

  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    return userId;
  }

  private removeUndefined(obj: any): any {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined && obj[key] !== null) {
        cleaned[key] = obj[key];
      }
    }
    return cleaned;
  }

  /** Invalidate cache — call after any write operation */
  invalidateCache(): void {
    this.cache = null;
  }

  async createAppointment(
    data: Omit<Appointment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      const userId = this.getCurrentUserId();
      const appointmentsCol = collection(this.db, 'appointments');
      const newDocRef = doc(appointmentsCol);
      const id = newDocRef.id;
      const now = new Date();

      const payload = this.removeUndefined({
        id,
        userId,
        patientId: data.patientId || '',
        patientName: data.patientName,
        patientPhone: data.patientPhone,
        patientFamilyId: data.patientFamilyId || '',
        appointmentDate: Timestamp.fromDate(new Date(data.appointmentDate)),
        appointmentTime: data.appointmentTime,
        reason: data.reason || '',
        notes: data.notes || '',
        status: data.status,
        isNewPatient: data.isNewPatient,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now)
      });

      await setDoc(newDocRef, payload);
      this.invalidateCache(); // clear cache so next load is fresh
      console.log('✓ Appointment booked with ID:', id);
      return id;

    } catch (error) {
      console.error('✗ Error booking appointment:', error);
      throw error;
    }
  }

  async getAppointments(): Promise<Appointment[]> {
    // Return cached result instantly if available
    if (this.cache !== null) {
      return this.cache;
    }

    try {
      const userId = this.getCurrentUserId();
      const appointmentsCol = collection(this.db, 'appointments');
      const q = query(appointmentsCol, where('userId', '==', userId));
      const snap = await getDocs(q);

      const appointments = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          ...data,
          id: d.id,
          appointmentDate: data.appointmentDate?.toDate?.() ?? new Date(data.appointmentDate),
          createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
        } as Appointment;
      });

      // Sort in-memory — avoids needing a Firestore composite index
      this.cache = appointments.sort((a, b) =>
        new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()
      );

      return this.cache;

    } catch (error) {
      console.error('✗ Error fetching appointments:', error);
      throw error;
    }
  }

  async updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
    try {
      const appointmentsCol = collection(this.db, 'appointments');
      await updateDoc(doc(appointmentsCol, id), {
        status,
        updatedAt: Timestamp.fromDate(new Date())
      });
      this.invalidateCache(); // clear cache so next load reflects updated status
    } catch (error) {
      console.error('✗ Error updating appointment status:', error);
      throw error;
    }
  }
}