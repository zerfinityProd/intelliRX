// src/app/services/appointmentService.ts
import { Injectable, inject } from '@angular/core';
import { AppointmentRepository } from '../repositories/interfaces/appointment.repository';
import { AuthenticationService } from './authenticationService';
import { AuthorizationService } from './authorizationService';
import { ClinicContextService } from './clinicContextService';
import { Appointment } from '../models/appointment.model';
import { normalizeEmail } from '../utilities/normalize-email';

/**
 * Orchestrates appointment access with role-based filtering and caching.
 * Depends on AppointmentRepository (abstract) — never on a concrete Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentService {

  private apptRepo = inject(AppointmentRepository);
  private authService = inject(AuthenticationService);
  private authorizationService = inject(AuthorizationService);
  private clinicContextService = inject(ClinicContextService);

  // In-memory cache — cleared when a new appointment is booked or status updated
  private doctorCache: Appointment[] | null = null;
  private doctorCacheClinicId: string | null = null;
  private receptionistCache: Appointment[] | null = null;
  private receptionistCacheClinicId: string | null = null;
  private allCache: Appointment[] | null = null;

  private getSubscriptionId(): string {
    return this.clinicContextService.requireSubscriptionId();
  }

  private getCurrentUserEmail(): string {
    const raw = this.authService.currentUserValue?.email || '';
    return raw ? normalizeEmail(raw) : '';
  }

  /** Invalidate cache — call after any write operation */
  invalidateCache(): void {
    this.doctorCache = null;
    this.doctorCacheClinicId = null;
    this.receptionistCache = null;
    this.receptionistCacheClinicId = null;
    this.allCache = null;
  }

  async createAppointment(
    data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      const id = await this.apptRepo.createAppointment(data);
      this.invalidateCache();
      return id;
    } catch (error) {
      console.error('✗ Error booking appointment:', error);
      throw error;
    }
  }

  /** Fetch ALL appointments within the subscription */
  async getAllAppointments(): Promise<Appointment[]> {
    if (this.allCache !== null) return this.allCache;
    try {
      const subId = this.getSubscriptionId();
      const appointments = await this.apptRepo.getAppointmentsBySubscription(subId);
      this.allCache = appointments;
      return this.allCache;
    } catch (error) {
      console.error('✗ Error fetching all appointments:', error);
      throw error;
    }
  }

  /**
   * Fetch appointments for the current user with role-based filtering.
   * - Doctors: own appointments only.
   * - Receptionists: clinic-scoped.
   * - Admin+Receptionist: full subscription.
   */
  async getAppointments(): Promise<Appointment[]> {
    try {
      const email = this.getCurrentUserEmail();
      const clinicId = this.clinicContextService.getSelectedClinicId();

      let role = await this.authorizationService.getUserRole(email);
      let isAdminReceptionist = false;
      if (role === 'subscription_owner') {
        const globalRoles = await this.authorizationService.getUserGlobalRoles(email);
        if (globalRoles.includes('receptionist')) {
          role = 'receptionist';
          isAdminReceptionist = true;
        }
      }

      if (role === 'receptionist') {
        if (isAdminReceptionist) {
          if (this.allCache !== null) return this.allCache;
          return this.getAllAppointments();
        }
        if (this.receptionistCache !== null && this.receptionistCacheClinicId === clinicId) {
          return this.receptionistCache;
        }
        const all = await this.getAllAppointments();
        const filtered = clinicId ? all.filter(a => a.clinic_id === clinicId) : all;
        this.receptionistCache = filtered;
        this.receptionistCacheClinicId = clinicId;
        return this.receptionistCache;
      }

      // Doctor
      if (this.doctorCache !== null && this.doctorCacheClinicId === clinicId) {
        return this.doctorCache;
      }

      const subId = this.getSubscriptionId();
      const appointments = await this.apptRepo.getAppointmentsByDoctor(subId, email);
      const filtered = clinicId
        ? appointments.filter(a => (a.clinic_id ? a.clinic_id === clinicId : true))
        : appointments;

      this.doctorCacheClinicId = clinicId;
      this.doctorCache = filtered;
      return this.doctorCache;

    } catch (error) {
      console.error('✗ Error fetching appointments:', error);
      throw error;
    }
  }

  async updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
    try {
      await this.apptRepo.updateAppointmentStatus(id, status);
      this.invalidateCache();
    } catch (error) {
      console.error('✗ Error updating appointment status:', error);
      throw error;
    }
  }

  async cancelAppointment(id: string, reason: string): Promise<void> {
    try {
      await this.apptRepo.cancelAppointment(id, reason);
      this.invalidateCache();
    } catch (error) {
      console.error('✗ Error cancelling appointment:', error);
      throw error;
    }
  }

  async getBookedSlotsForDate(
    dateStr: string,
    doctorEmail?: string,
    clinicId?: string,
    excludeApptId?: string
  ): Promise<string[]> {
    const subId = this.getSubscriptionId();
    return this.apptRepo.getBookedSlotsForDate(subId, dateStr, doctorEmail, excludeApptId);
  }

  async postponeAppointment(id: string, newDate: Date, newTime: string): Promise<void> {
    try {
      await this.apptRepo.postponeAppointment(id, newDate, newTime);
      this.invalidateCache();
    } catch (error) {
      console.error('✗ Error postponing appointment:', error);
      throw error;
    }
  }
}