// src/app/services/doctorCacheService.ts
import { Injectable, inject } from '@angular/core';
import { AuthenticationService } from './authenticationService';
import { AuthorizationService } from './authorizationService';
import { Appointment } from '../models/appointment.model';
import { normalizeEmail } from '../utilities/normalize-email';

export interface CachedDoctor {
    id: string;
    name: string;
    specialty: string;
    email: string;
}

/**
 * Centralised doctor-name cache.
 *
 * Replaces the duplicated `buildDoctorNameCache()` and
 * `getDoctorDisplayName()` logic that was copied across
 * reception-home.ts and appointments-list.ts.
 */
@Injectable({ providedIn: 'root' })
export class DoctorCacheService {

    private authService = inject(AuthenticationService);
    private authorizationService = inject(AuthorizationService);

    /** email → display name */
    private nameCache = new Map<string, string>();
    /** All loaded doctors (for filter dropdowns) */
    private allDoctors: CachedDoctor[] = [];
    private built = false;

    /**
     * Build the doctor name cache by fetching doctors from all clinics
     * the current user has access to.
     *
     * Safe to call multiple times — subsequent calls are no-ops unless
     * `invalidate()` has been called.
     */
    async buildCache(): Promise<void> {
        if (this.built) return;
        const email = this.authService.currentUserValue?.email;
        if (!email) return;
        try {
            const clinicIds = await this.authorizationService.getUserClinicIds(email);
            const seenEmails = new Set<string>();
            for (const clinicId of clinicIds) {
                const doctors = await this.authorizationService.getDoctorsForClinic(clinicId);
                for (const doc of doctors) {
                    const normEmail = normalizeEmail(doc.email);
                    if (seenEmails.has(normEmail)) continue;
                    seenEmails.add(normEmail);
                    this.nameCache.set(normEmail, doc.name);
                    this.allDoctors.push({
                        id: doc.id,
                        name: doc.name,
                        specialty: doc.specialty,
                        email: doc.email
                    });
                }
            }
            this.built = true;
        } catch (err) {
            console.warn('Failed to build doctor name cache:', err);
        }
    }

    /**
     * Resolve doctor display name from an appointment's doctor_id (email).
     * Falls back to the `doctor_name` denormalised field, then the raw email.
     */
    getDoctorDisplayName(appt: Appointment): string {
        if (appt.doctor_name) return appt.doctor_name;
        const email = (appt.doctor_id || '').trim().toLowerCase();
        if (!email) return '';
        return this.nameCache.get(email) || '';
    }

    /** Get a display name for a raw email. */
    getNameByEmail(email: string): string {
        return this.nameCache.get(email) || email;
    }

    /** All loaded doctors (for filter dropdowns). */
    getAllDoctors(): CachedDoctor[] {
        return this.allDoctors;
    }

    /**
     * Unique list of doctors that appear in the given appointments
     * (for filter dropdowns).
     */
    getDoctorFilterOptions(appointments: Appointment[]): Array<{ email: string; name: string }> {
        const seen = new Set<string>();
        const options: Array<{ email: string; name: string }> = [];
        for (const appt of appointments) {
            const email = (appt.doctor_id || '').trim().toLowerCase();
            if (!email || seen.has(email)) continue;
            seen.add(email);
            options.push({ email, name: this.nameCache.get(email) || email });
        }
        return options.sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Force rebuild on next call to buildCache(). */
    invalidate(): void {
        this.nameCache.clear();
        this.allDoctors = [];
        this.built = false;
    }
}
