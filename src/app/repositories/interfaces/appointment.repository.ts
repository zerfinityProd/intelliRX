// src/app/repositories/interfaces/appointment.repository.ts
import { Appointment } from '../../models/appointment.model';

/**
 * Abstract token for appointment data access.
 * Business logic (role filtering, caching) lives in AppointmentService.
 * This repository only handles raw CRUD against the data store.
 */
export abstract class AppointmentRepository {
  abstract createAppointment(
    data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string>;

  abstract getAppointmentsBySubscription(
    subscriptionId: string
  ): Promise<Appointment[]>;

  abstract getAppointmentsByDoctor(
    subscriptionId: string,
    doctorEmail: string
  ): Promise<Appointment[]>;

  abstract getBookedSlotsForDate(
    subscriptionId: string,
    dateStr: string,
    doctorEmail?: string,
    excludeApptId?: string
  ): Promise<string[]>;

  abstract updateAppointmentStatus(
    id: string,
    status: Appointment['status']
  ): Promise<void>;

  abstract cancelAppointment(id: string, reason: string): Promise<void>;

  abstract postponeAppointment(
    id: string,
    newDate: Date,
    newTime: string
  ): Promise<void>;

  abstract updateAppointment(
    id: string,
    data: Partial<Appointment>
  ): Promise<void>;
}
