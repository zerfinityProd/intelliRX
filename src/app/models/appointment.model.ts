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
  /**
   * SaaS scoping: clinic where this appointment belongs.
   * Optional for backward compatibility with existing documents.
   */
  clinicId?: string;
  /**
   * SaaS scoping: tenant subscription id (optional for backward compatibility).
   */
  subscriptionId?: string;
  /**
   * Patient ailments captured during appointment booking.
   * This should later be visible on patient + in "Ailments" section of the visit form.
   */
  ailments?: string;
  /**
   * Reason provided when an appointment is manually cancelled.
   * Displayed on the cancelled appointment card on both reception and doctor dashboards.
   */
  cancellationReason?: string;
  status: AppointmentStatus;
  isNewPatient: boolean;    // true = no patientId yet
  userId: string;           // Firebase Auth UID of the user who created this appointment
  doctorId?: string;        // email of the assigned doctor (links to allowedUsers collection)
  createdAt: Date;
  updatedAt: Date;
}