// src/app/services/appointmentCleanupService.ts
import { Injectable, inject } from '@angular/core';
import { AppointmentService } from './appointmentService';
import { PatientService } from './patient';
import { ClinicContextService } from './clinicContextService';
import { Appointment } from '../models/appointment.model';

/**
 * Cleans up first-time patients who were auto-created during appointment booking
 * but never received a visit on their appointment date.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentCleanupService {

  private hasRunThisSession = false;

  private readonly appointmentService = inject(AppointmentService);
  private readonly patientService = inject(PatientService);
  private readonly clinicContextService = inject(ClinicContextService);

  /**
   * Run cleanup once per session.
   */
  async runCleanupIfNeeded(): Promise<void> {
    if (this.hasRunThisSession) return;
    this.hasRunThisSession = true;

    // Skip cleanup if subscription context is not yet available
    if (!this.clinicContextService.getSubscriptionId()) {
      console.log('🧹 Cleanup skipped: subscription context not set yet.');
      this.hasRunThisSession = false; // Allow retry on next call
      return;
    }

    try {
      const allAppointments = await this.appointmentService.getAppointments();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const pastNewPatientAppts = allAppointments.filter(a => {
        if (!a.isNewPatient || !a.patient_id) return false;
        const apptDate = new Date(a.datetime);
        const apptDay = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
        return apptDay < today && a.status !== 'cancelled';
      });

      // Deduplicate by patient_id
      const seenPatientIds = new Set<string>();
      const uniqueAppts: Appointment[] = [];
      for (const appt of pastNewPatientAppts) {
        if (!seenPatientIds.has(appt.patient_id)) {
          seenPatientIds.add(appt.patient_id);
          uniqueAppts.push(appt);
        }
      }

      for (const appt of uniqueAppts) {
        try {
          const visits = await this.patientService.getPatientVisits(appt.patient_id);
          if (visits.length === 0) {
            console.log(`🧹 Cleanup: deleting no-visit patient ${appt.patient_id} (${appt.patientName})`);
            await this.patientService.deletePatient(appt.patient_id);
          }
        } catch {
          // Patient may have already been deleted — skip silently.
        }
      }
    } catch (error) {
      console.warn('Appointment cleanup skipped:', error);
    }
  }
}
