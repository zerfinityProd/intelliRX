// src/app/services/timeSlotService.ts
import { Injectable, inject } from '@angular/core';
import { ClinicService } from './clinicService';
import { AuthorizationService } from './authorizationService';
import { ClinicContextService } from './clinicContextService';
import { LeaveService } from './leave';
import { Leave } from '../models/leave.model';
import { DEFAULT_SYSTEM_SETTINGS } from '../config/userSettings';
import {
    generateTimeSlotsFromConfig,
    generateTimeSlotsFromClinicTimings,
    filterTimingsByAvailability,
    getWeekdayCode,
    isClinicOpenOnDate,
    getAvailabilityLabelsForDay
} from '../utilities/timeSlotUtils';

/**
 * Leave information returned alongside time slots so the UI can display
 * contextual banners (e.g. "Doctor is on leave").
 */
export interface LeaveInfo {
    /** True when the doctor has at least one approved leave on the selected date. */
    onLeave: boolean;
    /** 'All Day', 'FH', 'SH', or comma-separated combination. */
    leaveType: string;
    /** The raw approved leave records for this date. */
    leaves: Leave[];
}

export interface TimeSlotsResult {
    slots: string[];
    leaveInfo: LeaveInfo | null;
    /** Slots blocked by doctor leave — shown disabled in UI with a 'Leave' tag. */
    leaveBlockedSlots: string[];
}

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
    private leaveService = inject(LeaveService);

    /**
     * Generate time slots AND leave context for a clinic on a given date.
     * This is the primary method — `getTimeSlotsForClinic()` is a thin wrapper.
     */
    async getTimeSlotsWithLeaveInfo(
        clinicId?: string | null,
        date?: Date | string | null,
        doctorEmail?: string,
        invalidateCache?: boolean
    ): Promise<TimeSlotsResult> {
        const id = clinicId || this.clinicContextService.getSelectedClinicId();
        if (!id) {
            return {
                slots: generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots),
                leaveInfo: null,
                leaveBlockedSlots: []
            };
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

            console.log('[TimeSlotsService] \u2500 getTimeSlotsWithLeaveInfo',
                '\n  clinicId:', id,
                '\n  date:', date, '\u2192 effectiveDate:', effectiveDate,
                '\n  doctorEmail:', doctorEmail || '(none)',
                '\n  clinic timings:', JSON.stringify(timings));


            // Check if the clinic is open on this day
            if (effectiveDate && weekdays && weekdays.length > 0) {
                if (!isClinicOpenOnDate(weekdays, effectiveDate)) {
                    return { slots: [], leaveInfo: null, leaveBlockedSlots: [] };
                }
            }

            // ── Doctor availability filtering ──────────────────────────
            // Uses getAvailabilityLabelsForDay() which tries ALL known day-key
            // formats to handle the mismatch between admin-dashboard short codes
            // ('M','T','W','Th','F','Sa','Su') and staff-config-modal 3-letter
            // codes ('mon','tue','wed','thu','fri','sat','sun').
            let timingsWereFiltered = false;
            if (doctorEmail && effectiveDate) {
                const availability = await this.authorizationService.getDoctorAvailability(
                    doctorEmail, id
                );
                if (availability) {
                    const { labels: dayLabels, scheduled } =
                        getAvailabilityLabelsForDay(availability, effectiveDate);

                    // `scheduled` = true when the availability map has any days configured.
                    // If the current day is not listed AND the map is configured,
                    // the doctor is not available on this day → treat as unavailable.
                    const dayExistsInAvailability = scheduled;

                    if (timings && timings.length > 0) {
                        // Filter clinic timing blocks to only those the doctor works
                        timings = filterTimingsByAvailability(timings, dayLabels, dayExistsInAvailability);
                    } else if (dayExistsInAvailability && (!dayLabels || dayLabels.length === 0)) {
                        // No clinic timings to filter, doctor is explicitly unavailable this day
                        timingsWereFiltered = true;
                    }
                    timingsWereFiltered = true;
                }
            }

            // ── Leave filtering ────────────────────────────────────────
            // user_id in leaves is stored as normalized email (see my-leaves.ts).
            // We use doctorEmail directly — no getUserId() lookup needed.
            let leaveInfo: LeaveInfo | null = null;
            let leaveBlockedSlots: string[] = [];

            if (doctorEmail && effectiveDate) {
                    const y = effectiveDate.getFullYear();
                    const m = String(effectiveDate.getMonth() + 1).padStart(2, '0');
                    const d = String(effectiveDate.getDate()).padStart(2, '0');
                    const isoDate = `${y}-${m}-${d}`;

                    const leaveResult = await this.leaveService.isDoctorOnLeave(
                        doctorEmail, id, isoDate
                    );

                    if (leaveResult && leaveResult.onLeave) {
                        leaveInfo = {
                            onLeave: true,
                            leaveType: leaveResult.leaveType,
                            leaves: leaveResult.leaves
                        };

                        if (leaveResult.leaveType === 'All Day') {
                            // Full-day leave: all slots blocked but still shown disabled
                            const allSlots = generateTimeSlotsFromClinicTimings(timings);
                            return { slots: allSlots, leaveInfo, leaveBlockedSlots: allSlots };
                        }

                        // Half-day leave — collect blocked slots
                        if (timings && timings.length > 0) {
                            for (const leave of leaveResult.leaves) {
                                if (leave.timing !== 'All Day') {
                                    const blockedTimings = timings.filter(t =>
                                        t.label.toUpperCase() === leave.timing.toUpperCase()
                                    );
                                    leaveBlockedSlots = [
                                        ...leaveBlockedSlots,
                                        ...generateTimeSlotsFromClinicTimings(blockedTimings)
                                    ];
                                }
                            }
                        }
                    }
            }

            // If availability filtering reduced timings to empty (and no leave),
            // return no slots — the doctor is just unavailable that day.
            if (timingsWereFiltered && (!timings || timings.length === 0)) {
                return { slots: [], leaveInfo, leaveBlockedSlots };
            }

            return {
                slots: generateTimeSlotsFromClinicTimings(timings),
                leaveInfo,
                leaveBlockedSlots
            };
        } catch {
            return {
                slots: generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots),
                leaveInfo: null,
                leaveBlockedSlots: []
            };
        }
    }

    /**
     * Generate the list of available time slots for a clinic on a given date.
     * Backward-compatible wrapper around getTimeSlotsWithLeaveInfo().
     */
    async getTimeSlotsForClinic(
        clinicId?: string | null,
        date?: Date | string | null,
        doctorEmail?: string,
        invalidateCache?: boolean
    ): Promise<string[]> {
        const result = await this.getTimeSlotsWithLeaveInfo(
            clinicId, date, doctorEmail, invalidateCache
        );
        return result.slots;
    }

    /** Generate default time slots from system settings (no clinic context). */
    getDefaultTimeSlots(): string[] {
        return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
    }
}
