// src/app/services/timeSlotService.ts
import { Injectable, inject } from '@angular/core';
import { ClinicService } from './clinicService';
import { AuthorizationService } from './authorizationService';
import { ClinicContextService } from './clinicContextService';
import { DEFAULT_SYSTEM_SETTINGS } from '../config/systemSettings';
import {
    generateTimeSlotsFromConfig,
    generateTimeSlotsFromClinicTimings,
    filterTimingsByAvailability,
    getWeekdayKey,
    getWeekdayCode,
    isClinicOpenOnDate
} from '../utilities/timeSlotUtils';

/**
 * Centralised time-slot generation.
 *
 * Replaces the duplicated `refreshTimeSlotsForClinic()` logic that was
 * copied across home.ts, reception-home.ts, add-appointment.ts, and
 * appointments-list.ts.
 */
@Injectable({ providedIn: 'root' })
export class TimeSlotService {

    private clinicService = inject(ClinicService);
    private authorizationService = inject(AuthorizationService);
    private clinicContextService = inject(ClinicContextService);

    /**
     * Generate the list of available time slots for a clinic on a given date,
     * optionally filtered by a specific doctor's weekday availability.
     *
     * @param clinicId    The clinic to fetch schedule for. Falls back to the
     *                    currently-selected clinic if null/undefined.
     * @param date        The date to generate slots for (used for weekday
     *                    and doctor-availability checks).
     * @param doctorEmail Normalised doctor email for availability filtering.
     *                    Pass empty string to skip doctor filtering.
     * @param invalidateCache If true, forces a fresh fetch of clinic data.
     * @returns           Array of "HH:mm" time slot strings.
     */
    async getTimeSlotsForClinic(
        clinicId?: string | null,
        date?: Date | string | null,
        doctorEmail?: string,
        invalidateCache?: boolean
    ): Promise<string[]> {
        const id = clinicId || this.clinicContextService.getSelectedClinicId();
        if (!id) {
            return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
        }

        try {
            if (invalidateCache) {
                this.clinicService.invalidateCache();
            }

            const clinic = await this.clinicService.getClinicById(id);
            let timings = clinic?.schedule?.timings;
            const weekdays = clinic?.schedule?.weekdays;

            // Resolve the effective date (supports both Date and "YYYY-MM-DD")
            let effectiveDate: Date | undefined;
            if (date instanceof Date) {
                effectiveDate = date;
            } else if (typeof date === 'string' && date) {
                effectiveDate = new Date(date + 'T00:00:00');
            }

            // Check if the clinic is open on this day
            if (effectiveDate && weekdays && weekdays.length > 0) {
                if (!isClinicOpenOnDate(weekdays, effectiveDate)) {
                    return []; // Clinic closed on this day
                }
            }

            // Apply doctor availability filtering
            if (doctorEmail && effectiveDate && timings && timings.length > 0) {
                const availability = await this.authorizationService.getDoctorAvailability(
                    doctorEmail, id
                );
                if (availability) {
                    const dayKey = getWeekdayKey(effectiveDate);
                    const dayLabels = availability[dayKey];
                    timings = filterTimingsByAvailability(timings, dayLabels, true);
                }
            }

            return generateTimeSlotsFromClinicTimings(timings);
        } catch {
            return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
        }
    }

    /** Generate default time slots from system settings (no clinic context). */
    getDefaultTimeSlots(): string[] {
        return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
    }
}
