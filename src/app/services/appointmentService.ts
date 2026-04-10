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
  Timestamp,
  CollectionReference,
  DocumentData
} from '@angular/fire/firestore';
import { AuthenticationService } from './authenticationService';
import { AuthorizationService } from './authorizationService';
import { ClinicContextService } from './clinicContextService';
import { Appointment } from '../models/appointment.model';
import { normalizeEmail } from '../utilities/normalize-email';

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

  /**
   * Top-level appointments collection.
   * All queries filter by subscription_id.
   */
  private getAppointmentsCollection(): CollectionReference<DocumentData> {
    return collection(this.db, 'appointments');
  }

  private getSubscriptionId(): string {
    return this.clinicContextService.requireSubscriptionId();
  }

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
    data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      const appointmentsCol = this.getAppointmentsCollection();
      const newDocRef = doc(appointmentsCol);
      const id = newDocRef.id;
      const now = new Date();

      const clinicId = data.clinic_id || this.clinicContextService.getSelectedClinicId() || '';

      const payload = this.removeUndefined({
        id,
        subscription_id: data.subscription_id || this.getSubscriptionId(),
        clinic_id: clinicId,
        doctor_id: data.doctor_id ? normalizeEmail(data.doctor_id) : '',
        patient_id: data.patient_id || '',
        datetime: Timestamp.fromDate(new Date(data.datetime)),
        status: data.status,
        ...(data.patientName ? { patientName: data.patientName } : {}),
        ...(data.patientPhone ? { patientPhone: data.patientPhone } : {}),
        ...(data.doctor_name ? { doctor_name: data.doctor_name } : {}),
        ...(data.clinic_name ? { clinic_name: data.clinic_name } : {}),
        ...(data.ailments ? { ailments: data.ailments } : {}),
        ...(data.reason ? { reason: data.reason } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
        ...(data.isNewPatient !== undefined ? { isNewPatient: data.isNewPatient } : {}),
        ...(data.cancellationReason ? { cancellationReason: data.cancellationReason } : {}),
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now)
      });

      await setDoc(newDocRef, payload);
      this.invalidateCache();
      console.log('✓ Appointment booked with ID:', id);
      return id;

    } catch (error) {
      console.error('✗ Error booking appointment:', error);
      throw error;
    }
  }

  /** Fetch ALL appointments within the subscription */
  async getAllAppointments(): Promise<Appointment[]> {
    if (this.allCache !== null) {
      return this.allCache;
    }
    try {
      const appointmentsCol = this.getAppointmentsCollection();
      const subId = this.getSubscriptionId();
      const q = query(appointmentsCol, where('subscription_id', '==', subId));
      const snap = await getDocs(q);
      const appointments = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          ...data,
          id: d.id,
          datetime: data.datetime?.toDate?.() ?? new Date(data.datetime),
          createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
        } as Appointment;
      });
      this.allCache = appointments.sort((a, b) =>
        new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      );
      return this.allCache;
    } catch (error) {
      console.error('✗ Error fetching all appointments:', error);
      throw error;
    }
  }

  /**
   * Fetch appointments for the current user.
   * - Doctors: see only appointments where doctor_id matches their email.
   * - Receptionists: see all appointments.
   */
  async getAppointments(): Promise<Appointment[]> {
    try {
      const email = this.getCurrentUserEmail();
      const role = await this.authorizationService.getUserRole(email);

      if (role === 'receptionist') {
        if (this.cache !== null) return this.cache;
        const all = await this.getAllAppointments();
        this.cache = all;
        return this.cache;
      }

      // Doctors see only their own appointments (matched by email = doctor_id)
      const clinicId = this.clinicContextService.getSelectedClinicId();
      if (this.cache !== null && this.cacheClinicId === clinicId) {
        return this.cache;
      }

      const appointmentsCol = this.getAppointmentsCollection();
      const subId = this.getSubscriptionId();
      const q = query(
        appointmentsCol,
        where('subscription_id', '==', subId),
        where('doctor_id', '==', email)
      );
      const snap = await getDocs(q);

      const appointments = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          ...data,
          id: d.id,
          datetime: data.datetime?.toDate?.() ?? new Date(data.datetime),
          createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
        } as Appointment;
      });

      // If clinicId is set, doctors only see their appointments for that clinic.
      const filtered = clinicId
        ? appointments.filter(a => (a.clinic_id ? a.clinic_id === clinicId : true))
        : appointments;

      this.cacheClinicId = clinicId;
      this.cache = filtered.sort((a, b) =>
        new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      );

      return this.cache;

    } catch (error) {
      console.error('✗ Error fetching appointments:', error);
      throw error;
    }
  }

  async updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
    try {
      const appointmentsCol = this.getAppointmentsCollection();
      await updateDoc(doc(appointmentsCol, id), {
        status,
        updatedAt: Timestamp.fromDate(new Date())
      });
      this.invalidateCache();
    } catch (error) {
      console.error('✗ Error updating appointment status:', error);
      throw error;
    }
  }

  /** Cancel an appointment with a reason */
  async cancelAppointment(id: string, reason: string): Promise<void> {
    try {
      const appointmentsCol = this.getAppointmentsCollection();
      await updateDoc(doc(appointmentsCol, id), {
        status: 'cancelled',
        cancellationReason: reason,
        updatedAt: Timestamp.fromDate(new Date())
      });
      this.invalidateCache();
      console.log(`✓ Appointment ${id} cancelled with reason: ${reason}`);
    } catch (error) {
      console.error('✗ Error cancelling appointment:', error);
      throw error;
    }
  }

  /**
   * Fetch booked time slots for a specific date/doctor/clinic.
   */
  async getBookedSlotsForDate(
    dateStr: string,
    doctorEmail?: string,
    clinicId?: string,
    excludeApptId?: string
  ): Promise<string[]> {
    try {
      const [y, mo, day] = dateStr.split('-').map(Number);
      const startOfDay = new Date(y, mo - 1, day, 0, 0, 0, 0);
      const startOfNextDay = new Date(y, mo - 1, day + 1, 0, 0, 0, 0);

      const appointmentsCol = this.getAppointmentsCollection();
      const subId = this.getSubscriptionId();
      const q = query(
        appointmentsCol,
        where('subscription_id', '==', subId),
        where('datetime', '>=', Timestamp.fromDate(startOfDay)),
        where('datetime', '<', Timestamp.fromDate(startOfNextDay))
      );
      const snap = await getDocs(q);

      const bookedSlots: string[] = [];
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (data.status === 'cancelled') continue;
        if (excludeApptId && d.id === excludeApptId) continue;
        if (doctorEmail && normalizeEmail(data.doctor_id || '') !== doctorEmail) continue;

        // Extract time from datetime
        const dt = data.datetime?.toDate?.() ?? new Date(data.datetime);
        const timeStr = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        bookedSlots.push(timeStr);
      }
      return bookedSlots;
    } catch (error) {
      console.error('✗ Error fetching booked slots for date:', error);
      return [];
    }
  }

  /** Postpone (reschedule) an appointment to a new date and time slot. */
  async postponeAppointment(id: string, newDate: Date, newTime: string): Promise<void> {
    try {
      // Combine date and time into a single datetime
      const dt = new Date(newDate);
      const [h, m] = newTime.split(':').map(Number);
      dt.setHours(h, m, 0, 0);

      const appointmentsCol = this.getAppointmentsCollection();
      await updateDoc(doc(appointmentsCol, id), {
        datetime: Timestamp.fromDate(dt),
        updatedAt: Timestamp.fromDate(new Date())
      });
      this.invalidateCache();
      console.log(`✓ Appointment ${id} postponed to ${dt.toLocaleDateString()} at ${newTime}`);
    } catch (error) {
      console.error('✗ Error postponing appointment:', error);
      throw error;
    }
  }
}