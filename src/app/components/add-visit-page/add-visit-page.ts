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
    private originalAllergies: string[] = [];
    private originalAilments: string[] = [];

    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly patientService = inject(PatientService);
    private readonly appointmentService = inject(AppointmentService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly ngZone = inject(NgZone);

    async ngOnInit(): Promise<void> {
        const state = history.state as { origin?: string } | undefined;
        this.origin = (state?.origin === 'patient') ? 'patient' : 'home';

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
        if (!this.patient?.uniqueId) return;
        this.ngZone.run(() => {
            this.isLoadingVisits = true;
            this.cdr.detectChanges();
        });
        try {
            this.visits = await this.patientService.getPatientVisits(this.patient!.uniqueId);
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
            const patientId = this.patient.uniqueId;

            // Update allergies/ailments if changed
            const allergiesText = this.existingAllergies.join(', ');
            if (allergiesText !== (this.patient.allergies || '').trim()) {
                await this.patientService.updatePatient(patientId, { allergies: allergiesText });
            }
            const ailmentsText = this.existingAilments.join(', ');
            if (ailmentsText !== (this.patient.ailments || '').trim()) {
                await this.patientService.updatePatient(patientId, { ailments: ailmentsText });
            }

            // Save visit
            const visitData: any = {
                chiefComplaints: this.chiefComplaintsText.trim(),
                diagnosis: this.diagnosis.trim(),
                examination: this.formatExaminations(),
                treatmentPlan: this.treatmentPlan.trim(),
            };
            const presentIllnessText = this.formatArrayField(this.presentIllnesses);
            if (presentIllnessText) visitData.presentIllness = presentIllnessText;
            const medicinesText = this.formatMedicines();
            if (medicinesText) visitData.medicines = medicinesText;

            await this.patientService.addVisit(patientId, visitData);

            // ── Auto-complete matching appointment ──────────────
            try {
                const allAppts = await this.appointmentService.getAppointments();
                const patientName = (this.patient.name || '').trim().toLowerCase();
                const patientPhone = (this.patient.phone || '').trim();
                const today = new Date();
                const matchingAppt = allAppts.find(a => {
                    if (a.status !== 'scheduled') return false;
                    const nameMatch = (a.patientName || '').trim().toLowerCase() === patientName;
                    const phoneMatch = (a.patientPhone || '').trim() === patientPhone;
                    const apptDate = new Date(a.appointmentDate);
                    const sameOrPast =
                        apptDate.getFullYear() < today.getFullYear() ||
                        (apptDate.getFullYear() === today.getFullYear() &&
                            apptDate.getMonth() < today.getMonth()) ||
                        (apptDate.getFullYear() === today.getFullYear() &&
                            apptDate.getMonth() === today.getMonth() &&
                            apptDate.getDate() <= today.getDate());
                    return nameMatch && phoneMatch && sameOrPast;
                });
                if (matchingAppt && matchingAppt.id) {
                    await this.appointmentService.updateAppointmentStatus(matchingAppt.id, 'completed');
                }
            } catch {
                // Silent — don't block visit save if appointment update fails
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
            this.router.navigate(['/patient', this.patient.uniqueId]);
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
        if (!this.patient?.dateOfBirth) return null;
        const dob = new Date(this.patient.dateOfBirth);
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
}