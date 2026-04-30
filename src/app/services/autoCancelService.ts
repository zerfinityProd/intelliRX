// src/app/services/autoCancelService.ts
import { Injectable, inject } from '@angular/core';
import { AppointmentService } from './appointmentService';
import { PatientService } from './patient';
import { Appointment } from '../models/appointment.model';
import { DEFAULT_SYSTEM_SETTINGS } from '../config/systemSettings';
import { isSameLocalDay, normalizePhoneDigits } from '../utilities/date-helpers';

/**
 * Centralised auto-cancel logic.
 *
 * Replaces the duplicated `runAutoCancel()`, `scheduleAutoCancelAtCutoff()`,
 * and `hasAnyVisitTodayForAppointment()` logic that was copied across
 * reception-home.ts and appointments-list.ts.
 */
@Injectable({ providedIn: 'root' })
export class AutoCancelService {

    private appointmentService = inject(AppointmentService);
    private patientService = inject(PatientService);

    private autoCancelTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Schedule auto-cancel to run at the configured cutoff time.
     * Returns a cleanup function that clears the timer.
     *
     * @param appointments Current list of appointments (used by runAutoCancel).
     * @param onComplete   Callback invoked after auto-cancel completes.
     */
    scheduleAtCutoff(
        getAppointments: () => Appointment[],
        onComplete: () => void
    ): () => void {
        if (this.autoCancelTimer) clearTimeout(this.autoCancelTimer);

        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setHours(
            DEFAULT_SYSTEM_SETTINGS.autoCancelAt.hour,
            DEFAULT_SYSTEM_SETTINGS.autoCancelAt.minute,
            0,
            0
        );

        const delay = cutoff.getTime() - now.getTime();
        if (delay <= 0) {
            void this.runAutoCancel(getAppointments(), onComplete);
        } else {
            this.autoCancelTimer = setTimeout(
                () => void this.runAutoCancel(getAppointments(), onComplete),
                delay
            );
        }

        // Return cleanup function
        return () => {
            if (this.autoCancelTimer) {
                clearTimeout(this.autoCancelTimer);
                this.autoCancelTimer = null;
            }
        };
    }

    /**
     * Auto-cancel today's scheduled appointments that have no corresponding visit.
     */
    async runAutoCancel(
        appointments: Appointment[],
        onComplete?: () => void
    ): Promise<void> {
        const now = new Date();
        const cache = new Map<string, boolean>();
        const todaysScheduled = appointments.filter(a =>
            a.status === 'scheduled' && isSameLocalDay(new Date(a.datetime), now)
        );

        for (const appt of todaysScheduled) {
            if (!appt.id) continue;
            const hasVisitToday = await this.hasAnyVisitTodayForAppointment(appt, now, cache);
            if (!hasVisitToday) {
                try {
                    await this.appointmentService.updateAppointmentStatus(appt.id, 'cancelled');
                    appt.status = 'cancelled';
                } catch {
                    // keep going
                }
            }
        }

        onComplete?.();
    }

    /**
     * Auto-cancel all past-date appointments that are still 'scheduled'.
     */
    async autoCancelPastAppointments(appointments: Appointment[]): Promise<void> {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const pastScheduled = appointments.filter(a => {
            if (a.status !== 'scheduled') return false;
            const apptDate = new Date(a.datetime);
            const apptDay = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
            return apptDay < todayStart;
        });

        for (const appt of pastScheduled) {
            if (!appt.id) continue;
            try {
                await this.appointmentService.updateAppointmentStatus(appt.id, 'cancelled');
                appt.status = 'cancelled';
                console.log(`🕐 Auto-cancelled past appointment: ${appt.patientName} (${new Date(appt.datetime).toLocaleDateString()})`);
            } catch {
                // keep going
            }
        }
    }

    /**
     * Check if there is any visit created today for the patient linked to an appointment.
     */
    private async hasAnyVisitTodayForAppointment(
        appt: Appointment,
        today: Date,
        cache: Map<string, boolean>
    ): Promise<boolean> {
        const cacheKey = appt.patient_id
            ? `pid:${appt.patient_id}`
            : `np:${(appt.patientName || '').trim().toLowerCase()}|${normalizePhoneDigits(appt.patientPhone || '')}`;

        if (cache.has(cacheKey)) return cache.get(cacheKey)!;

        const checkVisitsForPatientId = async (patientId: string): Promise<boolean> => {
            const visits = await this.patientService.getPatientVisits(patientId);
            return visits.some(v => isSameLocalDay(new Date((v as any).created_at), today));
        };

        let result = false;
        try {
            if (appt.patient_id) {
                result = await checkVisitsForPatientId(appt.patient_id);
            } else {
                const phoneDigits = normalizePhoneDigits(appt.patientPhone || '');
                if (phoneDigits) {
                    const results = await this.patientService.searchPatientsByPhoneNumber(phoneDigits);
                    const nameLower = (appt.patientName || '').trim().toLowerCase();
                    const candidates = results.filter(p =>
                        (p.name || '').trim().toLowerCase() === nameLower &&
                        normalizePhoneDigits((p as any).phone) === phoneDigits
                    );
                    for (const p of candidates) {
                        if (p.id && await checkVisitsForPatientId(p.id)) {
                            result = true;
                            break;
                        }
                    }
                }
            }
        } catch {
            result = false;
        }

        cache.set(cacheKey, result);
        return result;
    }
}
