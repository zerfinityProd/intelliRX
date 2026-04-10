// src/app/models/appointment.model.ts

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

export interface Appointment {
  id?: string;
  subscription_id: string;
  clinic_id: string;
  doctor_id: string;           // user ID (email) of the assigned doctor
  patient_id: string;          // patient document ID
  datetime: Date;              // appointment date+time
  status: AppointmentStatus;

  // Denormalized display fields (avoids extra lookups)
  patientName?: string;
  patientPhone?: string;
  doctor_name?: string;        // denormalized doctor display name
  clinic_name?: string;        // denormalized clinic display name

  // Optional fields
  reason?: string;
  notes?: string;
  ailments?: string;
  cancellationReason?: string;
  isNewPatient?: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}