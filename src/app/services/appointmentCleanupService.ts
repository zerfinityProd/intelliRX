// src/app/services/appointmentCleanupService.ts
import { Injectable, inject } from '@angular/core';
import { AppointmentService } from './appointmentService';
import { PatientService } from './patient';
import { Appointment } from '../models/appointment.model';

/**
 * Cleans up first-time patients who were auto-created during appointment booking
 * but never received a visit on their appointment date.
 *
 * This service should be called once on relevant page loads (e.g. appointments list,
 * home page) to check and purge stale no-show records.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentCleanupService {

  private hasRunThisSession = false;

  private readonly appointmentService = inject(AppointmentService);
  private readonly patientService = inject(PatientService);

  /**
   * Run cleanup once per session.
   * Finds past appointments marked isNewPatient=true, checks if the patient
   * has any visits. If not, deletes the patient record.
   */
  async runCleanupIfNeeded(): Promise<void> {
    if (this.hasRunThisSession) return;
    this.hasRunThisSession = true;

    try {
      const allAppointments = await this.appointmentService.getAppointments();
      const now = new Date();
      // Only consider appointments whose date has fully passed (end of day)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const pastNewPatientAppts = allAppointments.filter(a => {
        if (!a.isNewPatient || !a.patientId) return false;
        const apptDate = new Date(a.appointmentDate);
        const apptDay = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
        return apptDay < today && a.status !== 'cancelled';
      });

      // Deduplicate by patientId
      const seenPatientIds = new Set<string>();
      const uniqueAppts: Appointment[] = [];
      for (const appt of pastNewPatientAppts) {
        if (!seenPatientIds.has(appt.patientId)) {
          seenPatientIds.add(appt.patientId);
          uniqueAppts.push(appt);
        }
      }

      for (const appt of uniqueAppts) {
        try {
          const visits = await this.patientService.getPatientVisits(appt.patientId);
          if (visits.length === 0) {
            console.log(`🧹 Cleanup: deleting no-visit patient ${appt.patientId} (${appt.patientName})`);
            await this.patientService.deletePatient(appt.patientId);
          }
        } catch {
          // Patient may have already been deleted or is inaccessible — skip silently.
        }
      }
    } catch (error) {
      console.warn('Appointment cleanup skipped:', error);
    }
  }
}
