// src/app/repositories/firebase/firebase-appointment.repository.ts
//
// THE ONLY FILE THAT MAY IMPORT FirestoreApiService FOR APPOINTMENT DATA.
//
import { Injectable, inject } from '@angular/core';
import { FirestoreApiService } from './firestore-api.service';
import { ClinicContextService } from '../../services/clinicContextService';
import { AppointmentRepository } from '../interfaces/appointment.repository';
import { Appointment } from '../../models/appointment.model';
import { normalizeEmail } from '../../utilities/normalize-email';

@Injectable()
export class FirebaseAppointmentRepository extends AppointmentRepository {
  private api = inject(FirestoreApiService);
  private clinicContextService = inject(ClinicContextService);

  private getSubscriptionId(): string {
    return this.clinicContextService.requireSubscriptionId();
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
    const id = await this.api.getNextSequentialId('apt');
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
      ...(data.bloodGroup ? { bloodGroup: data.bloodGroup } : {}),
      ...(data.reason ? { reason: data.reason } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
      ...(data.isNewPatient !== undefined ? { isNewPatient: data.isNewPatient } : {}),
      ...(data.cancellationReason ? { cancellationReason: data.cancellationReason } : {}),
      createdAt: now,
      updatedAt: now
    });

    await this.api.setDocument('appointments', id, payload);
    return id;
  }

  async getAppointmentsBySubscription(subscriptionId: string): Promise<Appointment[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'appointments',
      filters: [{ field: 'subscription_id', op: '==', value: subscriptionId }],
    });
    return docs
      .map(d => this.transformToAppointment(d.data, d.id))
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  }

  async getAppointmentsByDoctor(
    subscriptionId: string,
    doctorEmail: string
  ): Promise<Appointment[]> {
    const docs = await this.api.runQuery('', {
      collectionId: 'appointments',
      filters: [
        { field: 'subscription_id', op: '==', value: subscriptionId },
        { field: 'doctor_id', op: '==', value: doctorEmail }
      ],
    });
    return docs
      .map(d => this.transformToAppointment(d.data, d.id))
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  }

  async getBookedSlotsForDate(
    subscriptionId: string,
    dateStr: string,
    doctorEmail?: string,
    excludeApptId?: string
  ): Promise<string[]> {
    try {
      const [y, mo, day] = dateStr.split('-').map(Number);
      const startOfDay = new Date(y, mo - 1, day, 0, 0, 0, 0);
      const startOfNextDay = new Date(y, mo - 1, day + 1, 0, 0, 0, 0);

      const docs = await this.api.runQuery('', {
        collectionId: 'appointments',
        filters: [
          { field: 'subscription_id', op: '==', value: subscriptionId },
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

        const dt = new Date(data.datetime);
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        bookedSlots.push(timeStr);
      }
      return bookedSlots;
    } catch (error) {
      console.error('Error fetching booked slots:', error);
      return [];
    }
  }

  async updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
    await this.api.updateDocument('appointments', id, { status, updatedAt: new Date() });
  }

  async cancelAppointment(id: string, reason: string): Promise<void> {
    await this.api.updateDocument('appointments', id, {
      status: 'cancelled',
      cancellationReason: reason,
      updatedAt: new Date()
    });
  }

  async postponeAppointment(id: string, newDate: Date, newTime: string): Promise<void> {
    const dt = new Date(newDate);
    const [h, m] = newTime.split(':').map(Number);
    dt.setHours(h, m, 0, 0);
    await this.api.updateDocument('appointments', id, { datetime: dt, updatedAt: new Date() });
  }

  async updateAppointment(id: string, data: Partial<Appointment>): Promise<void> {
    const { id: _, createdAt: __, ...rest } = data as any;
    await this.api.updateDocument('appointments', id, {
      ...rest,
      updatedAt: new Date()
    });
  }
}

