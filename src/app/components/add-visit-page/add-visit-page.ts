import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PatientService } from '../../services/patient';
import { AppointmentService } from '../../services/appointmentService';
import { Patient, Visit } from '../../models/patient.model';
import { NavbarComponent } from '../navbar/navbar';
import Swal from 'sweetalert2';

interface DynamicField {
    description: string;
}
interface Examination {
    testName: string;
    result: string;
}
interface Medicine {
    name: string;
    dosage: string;
    frequency: string;
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
    presentIllnesses: DynamicField[] = [];
    newIllnessInput: string = '';
    existingAllergies: string[] = [];
    newAllergyInput: string = '';
    existingAilments: string[] = [];
    newAilmentInput: string = '';
    diagnosis: string = '';
    examinations: Examination[] = [];
    newExamTestName: string = '';
    newExamResult: string = '';
    treatmentPlan: string = '';
    advice: string = '';
    medicines: Medicine[] = [];
    newMedicineName: string = '';
    newMedicineDosage: string = '';
    newMedicineFrequency: string = '';

    errorMessage: string = '';
    successMessage: string = '';
    isSubmitting: boolean = false;

    // ── Expanded visit tracking ───────────────────────────────
    expandedVisitIds: Set<string> = new Set();

    // ── Navigation origin ─────────────────────────────────────
    private origin: 'home' | 'patient' = 'home';
    private routeAppointmentId: string = '';
    private originalAllergies: string[] = [];
    private originalAilments: string[] = [];

    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly patientService = inject(PatientService);
    private readonly appointmentService = inject(AppointmentService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly ngZone = inject(NgZone);

    async ngOnInit(): Promise<void> {
        const state = history.state as { origin?: string; appointmentId?: string } | undefined;
        this.origin = (state?.origin === 'patient') ? 'patient' : 'home';
        this.routeAppointmentId = (state?.appointmentId || '').trim();

        const patientId = this.route.snapshot.paramMap.get('id');
        if (!patientId) {
            this.router.navigate(['/home']);
            return;
        }
        await this.loadPatient(patientId);
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
            this.visits = await this.patientService.getPatientVisits(this.patient!.id);
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

    // ── Present Illness ───────────────────────────────────────
    onIllnessKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            const trimmed = this.newIllnessInput.trim();
            if (trimmed) { this.presentIllnesses.push({ description: trimmed }); this.newIllnessInput = ''; }
        }
    }
    onIllnessBlur(): void {
        const trimmed = this.newIllnessInput.trim();
        if (trimmed) { this.presentIllnesses.push({ description: trimmed }); this.newIllnessInput = ''; }
    }
    removeIllness(index: number): void { this.presentIllnesses.splice(index, 1); }

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
        this.medicines.push({ name, dosage: this.newMedicineDosage.trim(), frequency: this.newMedicineFrequency.trim() });
        this.newMedicineName = ''; this.newMedicineDosage = ''; this.newMedicineFrequency = '';
    }
    onMedicineKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') { event.preventDefault(); this.addMedicineChip(); }
    }
    onMedicineBlur(): void { this.addMedicineChip(); }
    removeMedicine(index: number): void { this.medicines.splice(index, 1); }

    // ── Examinations ──────────────────────────────────────────
    addExaminationChip(): void {
        const name = this.newExamTestName.trim();
        if (!name) return;
        this.examinations.push({ testName: name, result: this.newExamResult.trim() });
        this.newExamTestName = ''; this.newExamResult = '';
    }
    onExaminationKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') { event.preventDefault(); this.addExaminationChip(); }
    }
    onExaminationBlur(): void { this.addExaminationChip(); }
    removeExamination(index: number): void { this.examinations.splice(index, 1); }

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

            // ── Check for a matching appointment BEFORE saving the visit ──
            let matchedAppointment: any = null;
            try {
                const allAppts = await this.appointmentService.getAppointments();
                const patientName = (this.patient.name || '').trim().toLowerCase();
                const patientPhoneDigits = this.normalizePhoneDigits(this.patient.phone || '');
                const now = new Date();

                // Match scheduled appointments for today or any future date
                const todayStart = new Date(now);
                todayStart.setHours(0, 0, 0, 0);

                const candidates = allAppts
                    .filter(a => a.status === 'scheduled')
                    .filter(a => new Date(a.datetime) >= todayStart)
                    .filter(a => {
                        const apptPatientId = (a.patient_id || '').trim();
                        if (apptPatientId) return apptPatientId === patientId;
                        const nameMatch = (a.patientName || '').trim().toLowerCase() === patientName;
                        const phoneMatch = this.normalizePhoneDigits(a.patientPhone || '') === patientPhoneDigits;
                        return nameMatch && phoneMatch;
                    });

                matchedAppointment = this.pickClosestAppointmentByTime(candidates, now);
            } catch {
                // Silent — if appointment lookup fails, treat as walk-in
            }

            // Determine visit type based on whether a matching appointment was found
            const hasAppointment = !!(this.routeAppointmentId || matchedAppointment?.id);
            const visitType = hasAppointment ? 'appointment' : 'walk-in';
            const appointmentId = this.routeAppointmentId || matchedAppointment?.id || '';

            // Save visit
            const visitData: any = {
                visitType,
                chiefComplaints: this.chiefComplaintsText.trim(),
                diagnosis: this.diagnosis.trim(),
                examination: this.formatExaminations(),
                treatmentPlan: this.treatmentPlan.trim(),
            };

            // Link visit to the matched appointment
            if (appointmentId) {
                visitData.appointment_id = appointmentId;
            }
            const presentIllnessText = this.formatArrayField(this.presentIllnesses);
            if (presentIllnessText) visitData.presentIllness = presentIllnessText;
            const medicinesText = this.formatMedicines();
            if (medicinesText) visitData.medicines = medicinesText;

            await this.patientService.addVisit(patientId, visitData);

            // ── Auto-complete the matched appointment ──────────────
            const apptIdToComplete = this.routeAppointmentId || matchedAppointment?.id;
            if (apptIdToComplete) {
                try {
                    await this.appointmentService.updateAppointmentStatus(apptIdToComplete, 'completed');
                } catch {
                    // Silent — don't block visit save if appointment update fails
                }
            }

            this.isSubmitting = false;

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            await Swal.fire({
                title: 'Visit Added!',
                text: 'The new visit has been recorded.',
                icon: 'success',
                confirmButtonText: 'OK',
                confirmButtonColor: '#6366f1',
                timer: 2000,
                timerProgressBar: true,
                background: isDark ? '#1f1f1f' : '#ffffff',
                color: isDark ? '#e0e0e0' : '#1e293b',
            });

            this.router.navigate(['/patient', patientId]);
        } catch (error: any) {
            this.isSubmitting = false;
            this.errorMessage = `Failed to save visit: ${error?.message || 'An unexpected error occurred'}`;
        }
    }

    private navigateBack(): void {
        if (this.origin === 'patient' && this.patient) {
            this.router.navigate(['/patient', this.patient.id]);
        } else {
            this.router.navigate(['/home']);
        }
    }

    onCancel(): void {
        const allergiesChanged = this.existingAllergies.length !== this.originalAllergies.length ||
            this.existingAllergies.some(a => !this.originalAllergies.includes(a));
        const ailmentsChanged = this.existingAilments.length !== this.originalAilments.length ||
            this.existingAilments.some(a => !this.originalAilments.includes(a));

        const hasData = this.chiefComplaintsText.trim() || this.presentIllnesses.length ||
            allergiesChanged || ailmentsChanged ||
            this.diagnosis.trim() || this.treatmentPlan.trim() ||
            this.examinations.length || this.medicines.length;

        if (hasData) {
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
                denyButtonColor: '#6366f1',
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
    private formatArrayField(fields: DynamicField[]): string {
        return fields.map(f => f.description.trim()).filter(d => d.length > 0).join(', ');
    }
    private formatExaminations(): string {
        return this.examinations
            .filter(e => e.testName.trim())
            .map(e => `${e.testName.trim()}: ${e.result.trim()}`)
            .join(', ');
    }
    private formatMedicines(): string {
        return this.medicines
            .filter(m => m.name.trim())
            .map(m => {
                const parts = [m.name.trim()];
                if (m.dosage.trim()) parts.push(m.dosage.trim());
                if (m.frequency.trim()) parts.push(m.frequency.trim());
                return parts.join(' - ');
            }).join(', ');
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
}