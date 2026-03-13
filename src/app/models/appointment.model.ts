// src/app/models/appointment.model.ts

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

export interface Appointment {
  id?: string;
  patientId: string;        // links to Patient.uniqueId
  patientName: string;
  patientPhone: string;
  patientFamilyId?: string;
  appointmentDate: Date;
  appointmentTime: string;  // e.g. "10:30"
  reason?: string;
  notes?: string;
  status: AppointmentStatus;
  isNewPatient: boolean;    // true = no patientId yet
  userId: string;           // Firebase Auth UID
  createdAt: Date;
  updatedAt: Date;
}