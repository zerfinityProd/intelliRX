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
import { AuthorizationService } from './authorizationService';
import { Appointment } from '../models/appointment.model';
import { normalizeEmail } from '../utilities/normalize-email';
import { ClinicContextService } from './clinicContextService';

@Injectable({ providedIn: 'root' })
export class AppointmentService {

  // In-memory cache — cleared when a new appointment is booked or status updated
  private cache: Appointment[] | null = null;
  private allCache: Appointment[] | null = null;
  private cacheClinicId: string | null = null;

  constructor(
    private db: Firestore,
    private authService: AuthenticationService,
    private authorizationService: AuthorizationService,
    private clinicContextService: ClinicContextService
  ) {}

  private getCurrentUserId(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    return userId;
  }

  private getCurrentUserEmail(): string {
    const raw = this.authService.currentUserValue?.email || '';
    return raw ? normalizeEmail(raw) : '';
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
    this.allCache = null;
    this.cacheClinicId = null;
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
        // Ailments are captured from the appointment booking form and later
        // shown in patient + visit.
        ...(data.ailments ? { ailments: data.ailments } : {}),
        // Keep legacy fields if they were provided by older flows.
        ...(data.reason ? { reason: data.reason } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
        status: data.status,
        isNewPatient: data.isNewPatient,
        // Store doctorId if provided (email of the assigned doctor)
        ...(data.doctorId ? { doctorId: normalizeEmail(data.doctorId) } : {}),
        ...(data.clinicId ? { clinicId: data.clinicId } : {}),
        ...(data.subscriptionId ? { subscriptionId: data.subscriptionId } : {}),
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

  /** Fetch ALL appointments across all users — used for slot collision checks and receptionist view */
  async getAllAppointments(): Promise<Appointment[]> {
    if (this.allCache !== null) {
      return this.allCache;
    }
    try {
      const appointmentsCol = collection(this.db, 'appointments');
      const snap = await getDocs(appointmentsCol);
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
      this.allCache = appointments.sort((a, b) =>
        new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()
      );
      return this.allCache;
    } catch (error) {
      console.error('✗ Error fetching all appointments:', error);
      throw error;
    }
  }

  /**
   * Fetch appointments for the current user.
   * - Doctors (role === 'doctor'): see only appointments where doctorId matches their email.
   * - Receptionists: see all appointments (via getAllAppointments).
   */
  async getAppointments(): Promise<Appointment[]> {
    try {
      const email = this.getCurrentUserEmail();
      const role = await this.authorizationService.getUserRole(email);

      if (role === 'receptionist') {
        // Receptionists see all appointments
        if (this.cache !== null) return this.cache;
        const all = await this.getAllAppointments();
        this.cache = all;
        return this.cache;
      }

      // Doctors see only their own appointments (matched by email = doctorId)
      const clinicId = this.clinicContextService.getSelectedClinicId();
      if (this.cache !== null && this.cacheClinicId === clinicId) {
        return this.cache;
      }

      const appointmentsCol = collection(this.db, 'appointments');
      const q = query(appointmentsCol, where('doctorId', '==', email));
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

      // Sort in-memory — avoids needing a Firestore composite index.
      // If clinicId is set, doctors only see their appointments for that clinic.
      const filtered = clinicId
        ? appointments.filter(a => (a.clinicId ? a.clinicId === clinicId : true))
        : appointments;

      this.cacheClinicId = clinicId;
      this.cache = filtered.sort((a, b) =>
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

  /** Postpone (reschedule) an appointment to a new date and time slot. */
  async postponeAppointment(id: string, newDate: Date, newTime: string): Promise<void> {
    try {
      const appointmentsCol = collection(this.db, 'appointments');
      await updateDoc(doc(appointmentsCol, id), {
        appointmentDate: Timestamp.fromDate(newDate),
        appointmentTime: newTime,
        updatedAt: Timestamp.fromDate(new Date())
      });
      this.invalidateCache();
      console.log(`✓ Appointment ${id} postponed to ${newDate.toLocaleDateString()} at ${newTime}`);
    } catch (error) {
      console.error('✗ Error postponing appointment:', error);
      throw error;
    }
  }
}