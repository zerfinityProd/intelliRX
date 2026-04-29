// src/app/services/appointmentService.ts
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './api/firestore-api.service';
import { AuthenticationService } from './authenticationService';
import { AuthorizationService } from './authorizationService';
import { ClinicContextService } from './clinicContextService';
import { Appointment } from '../models/appointment.model';
import { normalizeEmail } from '../utilities/normalize-email';

@Injectable({ providedIn: 'root' })
export class AppointmentService {

  private api = inject(FirestoreApiService);
  private authService = inject(AuthenticationService);
  private authorizationService = inject(AuthorizationService);
  private clinicContextService = inject(ClinicContextService);

  // In-memory cache — cleared when a new appointment is booked or status updated
  private cache: Appointment[] | null = null;
  private allCache: Appointment[] | null = null;
  private cacheClinicId: string | null = null;

  /**
   * Top-level appointments collection.
   * All queries filter by subscription_id.
   */
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

  /**
   * Transform raw document data from REST API into an Appointment object.
   * Converts ISO date strings back to Date objects.
   */
  private transformToAppointment(data: any, id: string): Appointment {
    return {
      ...data,
      id,
      datetime: data.datetime ? new Date(data.datetime) : new Date(),
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    } as Appointment;
  }

  async createAppointment(
    data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      const id = this.api.generateDocId();
      const now = new Date();

      const clinicId = data.clinic_id || this.clinicContextService.getSelectedClinicId() || '';

      const payload = this.removeUndefined({
        id,
        subscription_id: data.subscription_id || this.getSubscriptionId(),
        clinic_id: clinicId,
        doctor_id: data.doctor_id ? normalizeEmail(data.doctor_id) : '',
        patient_id: data.patient_id || '',
        datetime: new Date(data.datetime),
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
        createdAt: now,
        updatedAt: now
      });

      await this.api.setDocument('appointments', id, payload);
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
      const subId = this.getSubscriptionId();
      const docs = await this.api.runQuery('', {
        collectionId: 'appointments',
        filters: [
          { field: 'subscription_id', op: '==', value: subId }
        ],
      });

      const appointments = docs.map(d => this.transformToAppointment(d.data, d.id));

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
   * - Receptionists: see all appointments for the currently selected clinic.
   */
  async getAppointments(): Promise<Appointment[]> {
    try {
      const email = this.getCurrentUserEmail();
      const role = await this.authorizationService.getUserRole(email);
      const clinicId = this.clinicContextService.getSelectedClinicId();

      if (role === 'receptionist') {
        if (this.cache !== null && this.cacheClinicId === clinicId) return this.cache;
        const all = await this.getAllAppointments();
        // Filter by the current clinic so receptionists see only their clinic's appointments
        const filtered = clinicId
          ? all.filter(a => a.clinic_id === clinicId)
          : all;
        this.cache = filtered;
        this.cacheClinicId = clinicId;
        return this.cache;
      }

      // Doctors see only their own appointments (matched by email = doctor_id)
      if (this.cache !== null && this.cacheClinicId === clinicId) {
        return this.cache;
      }

      const subId = this.getSubscriptionId();
      const docs = await this.api.runQuery('', {
        collectionId: 'appointments',
        filters: [
          { field: 'subscription_id', op: '==', value: subId },
          { field: 'doctor_id', op: '==', value: email }
        ],
      });

      const appointments = docs.map(d => this.transformToAppointment(d.data, d.id));

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
      await this.api.updateDocument('appointments', id, {
        status,
        updatedAt: new Date()
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
      await this.api.updateDocument('appointments', id, {
        status: 'cancelled',
        cancellationReason: reason,
        updatedAt: new Date()
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

      const subId = this.getSubscriptionId();
      const docs = await this.api.runQuery('', {
        collectionId: 'appointments',
        filters: [
          { field: 'subscription_id', op: '==', value: subId },
          { field: 'datetime', op: '>=', value: startOfDay },
          { field: 'datetime', op: '<', value: startOfNextDay }
        ],
      });

      const bookedSlots: string[] = [];
      for (const d of docs) {
        const data = d.data;
        if (data.status === 'cancelled') continue;
        if (excludeApptId && d.id === excludeApptId) continue;
        if (doctorEmail && normalizeEmail(data.doctor_id || '') !== doctorEmail) continue;

        // Extract time from datetime
        const dt = new Date(data.datetime);
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

      await this.api.updateDocument('appointments', id, {
        datetime: dt,
        updatedAt: new Date()
      });
      this.invalidateCache();
      console.log(`✓ Appointment ${id} postponed to ${dt.toLocaleDateString()} at ${newTime}`);
    } catch (error) {
      console.error('✗ Error postponing appointment:', error);
      throw error;
    }
  }
}