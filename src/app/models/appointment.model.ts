export interface Appointment {
  id?: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  appointmentDate: Date;
  appointmentTime: string;
  duration: number; // in minutes
  reason: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentSlot {
  time: string;
  available: boolean;
  appointmentId?: string;
}