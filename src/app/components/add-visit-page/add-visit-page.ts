import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PatientService } from '../../services/patient';
import { AppointmentService } from '../../services/appointmentService';
import { AuthenticationService } from '../../services/authenticationService';
import { Patient, Visit } from '../../models/patient.model';
import { NavbarComponent } from '../navbar/navbar';
import Swal from 'sweetalert2';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';


interface Examination {
    testName: string;
    status: string;
    result: string;
}
interface Medicine {
    name: string;
    dosage: string;
    frequency: string;
    durationDays: string;
}

/**
 * AddVisitPageComponent: Full-page version of the Add Visit form.
 * Shows the visit form on the left and visit history on the right.
 * Route: /patient/:id/add-visit
 */
@Component({
    selector: 'app-add-visit-page',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent],
    templateUrl: './add-visit-page.html',
    styleUrl: './add-visit-page.css'
})
export class AddVisitPageComponent implements OnInit {

    // ── Patient & Visit Data ──────────────────────────────────
    patient: Patient | null = null;
    visits: Visit[] = [];
    isLoadingPatient: boolean = true;
    isLoadingVisits: boolean = false;

    // ── Form Fields ───────────────────────────────────────────
    chiefComplaintsText: string = '';
    clinicalFindingsText: string = '';
    existingAllergies: string[] = [];
    newAllergyInput: string = '';
    existingAilments: string[] = [];
    newAilmentInput: string = '';
    diagnosis: string = '';
    examinations: Examination[] = [];
    newExamTestName: string = '';
    newExamResult: string = '';
    newExamStatus: string = '';
    treatmentPlan: string = '';
    advice: string = '';
    medicines: Medicine[] = [];
    newMedicineName: string = '';
    newMedicineDosage: string = '';
    newMedicineFrequency: string = '';
    newMedicineDuration: string = '';

    errorMessage: string = '';
    successMessage: string = '';
    isSubmitting: boolean = false;

    // ── Edit mode ─────────────────────────────────────────────
    isEditMode: boolean = false;
    editVisitId: string = '';

    // ── Expanded visit tracking ───────────────────────────────
    expandedVisitIds: Set<string> = new Set();

    // ── Navigation origin ─────────────────────────────────────
    private origin: 'home' | 'patient' | 'appointments' = 'home';
    private routeAppointmentId: string = '';
    private originalAllergies: string[] = [];
    private originalAilments: string[] = [];

    // ── Original form snapshot (for dirty-checking) ───────────
    private originalFormState: string = '';

    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly patientService = inject(PatientService);
    private readonly appointmentService = inject(AppointmentService);
    private readonly authService = inject(AuthenticationService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly ngZone = inject(NgZone);

    async ngOnInit(): Promise<void> {
        const state = history.state as { origin?: string; appointmentId?: string; editVisitId?: string; editVisitData?: any } | undefined;
        this.origin = (state?.origin === 'patient') ? 'patient' : (state?.origin === 'appointments') ? 'appointments' : 'home';
        this.routeAppointmentId = (state?.appointmentId || '').trim();

        // ── Edit mode detection ──
        if (state?.editVisitId) {
            this.isEditMode = true;
            this.editVisitId = state.editVisitId;
        }

        const patientId = this.route.snapshot.paramMap.get('id');
        if (!patientId) {
            this.router.navigate(['/home']);
            return;
        }
        await this.loadPatient(patientId);

        // ── Pre-populate fields in edit mode ──
        if (this.isEditMode && state?.editVisitData) {
            this.populateEditFields(state.editVisitData);
        }

        // Snapshot the form state after initialization for dirty-checking
        this.originalFormState = this.getFormStateSnapshot();
    }

    private populateEditFields(visit: any): void {
        this.chiefComplaintsText = visit.chiefComplaints || '';
        this.clinicalFindingsText = visit.presentIllness || '';
        this.diagnosis = visit.diagnosis || '';
        this.treatmentPlan = visit.treatmentPlan || '';
        this.advice = visit.advice || '';

        // Examinations — stored as string[] (e.g. ["test [status]: result", ...])
        if (visit.examination) {
            const examArr: string[] = Array.isArray(visit.examination)
                ? visit.examination
                : (visit.examination as string).split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            this.examinations = examArr.map((s: string) => {
                // New format: "testName [status]: result"
                const statusMatch = s.match(/^(.+?)\s*\[(\w[\w-]*)\]\s*:\s*(.*)$/);
                if (statusMatch) {
                    return { testName: statusMatch[1].trim(), status: statusMatch[2], result: statusMatch[3].trim() };
                }
                // Old format: "testName: result"
                const parts = s.split(':').map((p: string) => p.trim());
                return { testName: parts[0] || '', status: '', result: parts.slice(1).join(':').trim() || '' };
            });
        }

        // Medicines — stored as string[] (e.g. ["name - dosage - freq - 5 days", ...])
        if (visit.medicines) {
            const medArr: string[] = Array.isArray(visit.medicines)
                ? visit.medicines
                : (visit.medicines as string).split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            this.medicines = medArr.map((s: string) => {
                const parts = s.split(' - ').map((p: string) => p.trim());
                const durationPart = parts[3] || '';
                const durationNum = durationPart.replace(/\s*days?\s*/i, '').trim();
                return { name: parts[0] || '', dosage: parts[1] || '', frequency: parts[2] || '', durationDays: durationNum };
            });
        }

        this.cdr.detectChanges();
    }

    async loadPatient(patientId: string): Promise<void> {
        this.ngZone.run(() => {
            this.isLoadingPatient = true;
            this.cdr.detectChanges();
        });
        try {
            this.patient = await this.patientService.getPatient(patientId);
            this.ngZone.run(() => {
                if (!this.patient) {
                    this.router.navigate(['/home']);
                    return;
                }
                this.initializePatientFields();
                this.isLoadingPatient = false;
                this.cdr.detectChanges();
                this.loadVisits();
            });
        } catch {
            this.ngZone.run(() => {
                this.isLoadingPatient = false;
                this.cdr.detectChanges();
            });
        }
    }

    private initializePatientFields(): void {
        if (!this.patient) return;
        this.existingAllergies = this.patient.allergies
            ? this.patient.allergies.split(',').map(a => a.trim()).filter(a => a.length > 0)
            : [];
        this.existingAilments = this.patient.ailments
            ? this.patient.ailments.split(',').map(a => a.trim()).filter(a => a.length > 0)
            : [];
        this.originalAllergies = [...this.existingAllergies];
        this.originalAilments = [...this.existingAilments];
    }

    async loadVisits(): Promise<void> {
        if (!this.patient?.id) return;
        this.ngZone.run(() => {
            this.isLoadingVisits = true;
            this.cdr.detectChanges();
        });
        try {
            let allVisits = await this.patientService.getPatientVisits(this.patient!.id);

            // Doctor visit isolation: doctors only see their own visits
            const currentUser = this.authService.currentUserValue;
            if (currentUser?.role === 'doctor' && currentUser?.email) {
                const doctorEmail = currentUser.email.trim().toLowerCase();
                allVisits = allVisits.filter(v =>
                    !v.doctor_id || v.doctor_id.trim().toLowerCase() === doctorEmail
                );
            }

            this.visits = allVisits;
            this.ngZone.run(() => {
                this.isLoadingVisits = false;
                this.cdr.detectChanges();
            });
        } catch {
            this.ngZone.run(() => {
                this.isLoadingVisits = false;
                this.cdr.detectChanges();
            });
        }
    }



    // ── Allergies ─────────────────────────────────────────────
    onAllergyKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') { event.preventDefault(); this.addNewAllergy(); }
    }
    onAllergyBlur(): void { this.addNewAllergy(); }
    addNewAllergy(): void {
        const trimmed = this.newAllergyInput.trim();
        if (trimmed && !this.existingAllergies.includes(trimmed)) { this.existingAllergies.push(trimmed); }
        this.newAllergyInput = '';
    }
    removeAllergy(index: number): void { this.existingAllergies.splice(index, 1); }

    // ── Ailments ──────────────────────────────────────────────
    onAilmentKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') { event.preventDefault(); this.addNewAilment(); }
    }
    onAilmentBlur(): void { this.addNewAilment(); }
    addNewAilment(): void {
        const trimmed = this.newAilmentInput.trim();
        if (trimmed && !this.existingAilments.includes(trimmed)) { this.existingAilments.push(trimmed); }
        this.newAilmentInput = '';
    }
    removeAilment(index: number): void { this.existingAilments.splice(index, 1); }

    // ── Medicines ─────────────────────────────────────────────
    addMedicineChip(): void {
        const name = this.newMedicineName.trim();
        if (!name) return;
        this.medicines.push({
            name,
            dosage: this.newMedicineDosage.trim(),
            frequency: this.newMedicineFrequency.trim(),
            durationDays: this.newMedicineDuration.trim()
        });
        this.newMedicineName = ''; this.newMedicineDosage = ''; this.newMedicineFrequency = ''; this.newMedicineDuration = '';
    }
    onMedicineKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') { event.preventDefault(); this.addMedicineChip(); }
    }
    onMedicineBlur(): void { /* no auto-add — user must click + Add */ }
    removeMedicine(index: number): void { this.medicines.splice(index, 1); }
    editMedicine(index: number): void {
        const med = this.medicines[index];
        this.newMedicineName = med.name;
        this.newMedicineDosage = med.dosage;
        this.newMedicineFrequency = med.frequency;
        this.newMedicineDuration = med.durationDays;
        this.medicines.splice(index, 1);
    }

    // ── Examinations ──────────────────────────────────────────
    addExaminationChip(): void {
        const name = this.newExamTestName.trim();
        if (!name) return;
        this.examinations.push({ testName: name, status: this.newExamStatus, result: this.newExamResult.trim() });
        this.newExamTestName = ''; this.newExamResult = ''; this.newExamStatus = '';
    }
    onExaminationKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') { event.preventDefault(); this.addExaminationChip(); }
    }
    onExaminationBlur(): void { /* no auto-add — user must click + Add */ }
    removeExamination(index: number): void { this.examinations.splice(index, 1); }
    editExamination(index: number): void {
        const exam = this.examinations[index];
        this.newExamTestName = exam.testName;
        this.newExamStatus = exam.status;
        this.newExamResult = exam.result;
        this.examinations.splice(index, 1);
    }

    // ── Visit History helpers ─────────────────────────────────
    toggleVisitExpand(visitId: string): void {
        if (this.expandedVisitIds.has(visitId)) {
            this.expandedVisitIds.delete(visitId);
        } else {
            this.expandedVisitIds.add(visitId);
        }
    }
    isVisitExpanded(visitId: string | undefined): boolean {
        return visitId ? this.expandedVisitIds.has(visitId) : false;
    }

    // ── Submit ────────────────────────────────────────────────
    async onSubmit(): Promise<void> {
        this.errorMessage = '';
        this.successMessage = '';
        if (!this.chiefComplaintsText.trim()) {
            this.errorMessage = 'Chief complaints is required';
            return;
        }
        if (this.chiefComplaintsText.length > 200) {
            this.errorMessage = 'Chief complaints cannot exceed 200 characters';
            return;
        }
        if (this.diagnosis.length > 200) {
            this.errorMessage = 'Diagnosis cannot exceed 200 characters';
            return;
        }
        if (this.treatmentPlan.length > 200) {
            this.errorMessage = 'Treatment plan cannot exceed 200 characters';
            return;
        }
        if (!this.patient) return;
        this.isSubmitting = true;
        try {
            const patientId = this.patient.id!;

            // Update allergies/ailments if changed
            const allergiesText = this.existingAllergies.join(', ');
            if (allergiesText !== (this.patient.allergies || '').trim()) {
                await this.patientService.updatePatient(patientId, { allergies: allergiesText });
            }
            const ailmentsText = this.existingAilments.join(', ');
            if (ailmentsText !== (this.patient.ailments || '').trim()) {
                await this.patientService.updatePatient(patientId, { ailments: ailmentsText });
            }

            // Build visit data
            const currentEmail = this.authService.currentUserValue?.email || '';
            const visitData: any = {
                chiefComplaints: this.chiefComplaintsText.trim(),
                diagnosis: this.diagnosis.trim(),
                examination: this.formatExaminations(),
                treatmentPlan: this.treatmentPlan.trim(),
                advice: this.advice.trim(),
                doctor_id: currentEmail,
            };
            const clinicalFindingsVal = this.clinicalFindingsText.trim();
            if (clinicalFindingsVal) visitData.presentIllness = clinicalFindingsVal;
            const medicinesArr = this.formatMedicines();
            if (medicinesArr.length > 0) visitData.medicines = medicinesArr;

            if (this.isEditMode && this.editVisitId) {
                // ── UPDATE existing visit ──
                visitData.updated_at = new Date().toISOString();
                await this.patientService.updateVisit(patientId, this.editVisitId, visitData);

                this.isSubmitting = false;
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                await Swal.fire({
                    title: 'Visit Updated!',
                    text: 'The visit has been updated successfully.',
                    icon: 'success',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#148D9E',
                    timer: 2000,
                    timerProgressBar: true,
                    background: isDark ? '#1f1f1f' : '#ffffff',
                    color: isDark ? '#e0e0e0' : '#1e293b',
                });
                this.router.navigate(['/patient', patientId], { state: { activeTab: 'visits' } });
            } else {
                // ── CREATE new visit ──

                // ── Appointment–Visit linking logic ──
                // Rules:
                //   1. Explicit navigation (routeAppointmentId) → always link
                //   2. Same-day, within time slot → auto-link silently
                //   3. Same-day, before or after slot → popup "Link to appointment?"
                //   4. Different day → never link (walk-in)
                let matchedAppointment: any = null;
                let shouldLinkAppointment = false;

                if (this.routeAppointmentId) {
                    // Explicitly navigated from an appointment card — always link
                    shouldLinkAppointment = true;
                } else {
                    try {
                        const allAppts = await this.appointmentService.getAppointments();
                        const patientName = (this.patient.name || '').trim().toLowerCase();
                        const patientPhoneDigits = this.normalizePhoneDigits(this.patient.phone || '');
                        const now = new Date();

                        // Only match SAME-DAY appointments (not future dates)
                        const candidates = allAppts
                            .filter(a => a.status === 'scheduled')
                            .filter(a => this.isSameLocalDay(new Date(a.datetime), now))
                            .filter(a => {
                                const apptPatientId = (a.patient_id || '').trim();
                                if (apptPatientId) return apptPatientId === patientId;
                                const nameMatch = (a.patientName || '').trim().toLowerCase() === patientName;
                                const phoneMatch = this.normalizePhoneDigits(a.patientPhone || '') === patientPhoneDigits;
                                return nameMatch && phoneMatch;
                            });

                        matchedAppointment = this.pickClosestAppointmentByTime(candidates, now);

                        if (matchedAppointment) {
                            const timing = this.classifyAppointmentTiming(matchedAppointment, now);
                            if (timing === 'within-slot') {
                                // Within the appointment's time slot — auto-complete silently
                                shouldLinkAppointment = true;
                            } else {
                                // Before or after the time slot — ask the user
                                const linkResult = await this.askLinkToAppointment(matchedAppointment);
                                if (linkResult === 'cancel') {
                                    // User closed the popup — abort save, go back to form
                                    this.isSubmitting = false;
                                    return;
                                }
                                shouldLinkAppointment = linkResult === 'link';
                            }
                        }
                    } catch {
                        // Silent — if appointment lookup fails, treat as walk-in
                    }
                }

                const hasAppointment = shouldLinkAppointment && !!(this.routeAppointmentId || matchedAppointment?.id);
                const visitType = hasAppointment ? 'appointment' : 'walk-in';
                const appointmentId = hasAppointment ? (this.routeAppointmentId || matchedAppointment?.id || '') : '';

                visitData.visitType = visitType;
                if (appointmentId) {
                    visitData.appointment_id = appointmentId;
                }

                await this.patientService.addVisit(patientId, visitData);

                // Auto-complete the linked appointment
                if (hasAppointment && appointmentId) {
                    try {
                        await this.appointmentService.updateAppointmentStatus(appointmentId, 'completed');
                    } catch {
                        // Silent — don't block visit save if appointment update fails
                    }
                }

                this.isSubmitting = false;
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                await Swal.fire({
                    title: 'Visit Added!',
                    icon: 'success',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#148D9E',
                    timer: 2000,
                    timerProgressBar: true,
                    background: isDark ? '#1f1f1f' : '#ffffff',
                    color: isDark ? '#e0e0e0' : '#1e293b',
                });
                if (this.origin === 'appointments') {
                    this.router.navigate(['/appointments']);
                } else {
                    this.router.navigate(['/patient', patientId], { state: { activeTab: 'visits' } });
                }
            }
        } catch (error: any) {
            this.isSubmitting = false;
            this.errorMessage = `Failed to save visit: ${error?.message || 'An unexpected error occurred'}`;
        }
    }

    private navigateBack(): void {
        if (this.origin === 'appointments') {
            this.router.navigate(['/appointments']);
        } else if (this.origin === 'patient' && this.patient) {
            this.router.navigate(['/patient', this.patient.id]);
        } else {
            this.router.navigate(['/home']);
        }
    }

    /** Serialise the current form values into a comparable string. */
    private getFormStateSnapshot(): string {
        return JSON.stringify({
            chiefComplaints: this.chiefComplaintsText.trim(),
            clinicalFindings: this.clinicalFindingsText.trim(),
            allergies: [...this.existingAllergies].sort(),
            ailments: [...this.existingAilments].sort(),
            diagnosis: this.diagnosis.trim(),
            treatmentPlan: this.treatmentPlan.trim(),
            examinations: this.examinations.map(e => `${e.testName}|${e.status}|${e.result}`),
            medicines: this.medicines.map(m => `${m.name}|${m.dosage}|${m.frequency}|${m.durationDays}`),
        });
    }

    /** Check whether the form has been modified since it was loaded. */
    private isFormDirty(): boolean {
        return this.getFormStateSnapshot() !== this.originalFormState;
    }

    onCancel(): void {
        if (this.isFormDirty()) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            Swal.fire({
                title: 'Discard changes?',
                text: 'All unsaved data will be lost.',
                icon: 'warning',
                showConfirmButton: true,
                confirmButtonText: 'Yes, cancel',
                confirmButtonColor: '#ef4444',
                showDenyButton: true,
                denyButtonText: 'Keep editing',
                denyButtonColor: '#148D9E',
                background: isDark ? '#1f1f1f' : '#ffffff',
                color: isDark ? '#e0e0e0' : '#1e293b',
            }).then(result => {
                if (result.isConfirmed) {
                    this.navigateBack();
                }
            });
        } else {
            this.navigateBack();
        }
    }

    // ── Formatters ────────────────────────────────────────────
    private formatExaminations(): string[] {
        return this.examinations
            .filter(e => e.testName.trim())
            .map(e => {
                let str = e.testName.trim();
                if (e.status) str += ` [${e.status}]`;
                str += `: ${e.result.trim()}`;
                return str;
            });
    }
    private formatMedicines(): string[] {
        return this.medicines
            .filter(m => m.name.trim())
            .map(m => {
                const parts = [m.name.trim()];
                if (m.dosage.trim()) parts.push(m.dosage.trim());
                if (m.frequency.trim()) parts.push(m.frequency.trim());
                if (m.durationDays.trim()) parts.push(m.durationDays.trim() + ' days');
                return parts.join(' - ');
            });
    }

    getInitials(name: string): string {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getPatientAge(): number | null {
        if (!this.patient?.dob) return null;
        const dob = new Date(this.patient.dob);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
    }

    formatDateTime(date: Date | undefined | any): string {
        if (!date) return 'N/A';
        if (date && typeof date.toDate === 'function') { date = date.toDate(); }
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    private normalizePhoneDigits(phone: string): string {
        return String(phone).replace(/\D/g, '');
    }

    private isSameLocalDay(a: Date, b: Date): boolean {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    private toLocalDateTime(date: Date, time: string): Date {
        const dt = new Date(date);
        const [h, m] = String(time || '').split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return dt;
        dt.setHours(h, m, 0, 0);
        return dt;
    }

    private pickClosestAppointmentByTime(appointments: Array<{ datetime: any }>, now: Date) {
        if (!appointments?.length) return null;
        let best = appointments[0] as any;
        let bestDiff = Math.abs(
            new Date(best.datetime).getTime() - now.getTime()
        );
        for (const a of appointments.slice(1) as any[]) {
            const diff = Math.abs(
                new Date(a.datetime).getTime() - now.getTime()
            );
            if (diff < bestDiff) {
                best = a;
                bestDiff = diff;
            }
        }
        return best;
    }

    /**
     * Classify the timing of a visit relative to an appointment's time slot.
     * Slot = [appointment.datetime, appointment.datetime + slotMinutes].
     */
    private classifyAppointmentTiming(appointment: any, now: Date): 'within-slot' | 'before-slot' | 'after-slot' {
        const apptTime = new Date(appointment.datetime);
        const slotDurationMs = DEFAULT_SYSTEM_SETTINGS.timeSlots.slotMinutes * 60 * 1000;
        const slotEnd = new Date(apptTime.getTime() + slotDurationMs);
        if (now < apptTime) return 'before-slot';
        if (now <= slotEnd) return 'within-slot';
        return 'after-slot';
    }

    /**
     * Show a SweetAlert2 popup asking if the visit should be linked to an appointment.
     * Returns 'link' if user confirms, 'walkin' if user denies, 'cancel' if dismissed.
     */
    private async askLinkToAppointment(appointment: any): Promise<'link' | 'walkin' | 'cancel'> {
        const apptTime = new Date(appointment.datetime);
        const timeStr = apptTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        const result = await Swal.fire({
            title: 'Link to Appointment?',
            text: `This patient has an appointment at ${timeStr} today. Is this visit against that appointment?`,
            icon: 'question',
            showConfirmButton: true,
            confirmButtonText: 'Yes, link it',
            confirmButtonColor: '#148D9E',
            showDenyButton: true,
            denyButtonText: 'No, walk-in',
            denyButtonColor: '#6b7280',
            showCloseButton: true,
            allowOutsideClick: false,
            background: isDark ? '#1f1f1f' : '#ffffff',
            color: isDark ? '#e0e0e0' : '#1e293b',
        });

        if (result.isConfirmed) return 'link';
        if (result.isDenied) return 'walkin';
        return 'cancel';
    }
}