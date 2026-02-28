import { Component, Input, Output, EventEmitter, NgZone, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';
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
 * AddVisitComponent: Handles adding new visits to existing patients
 * Responsible for medical information (illnesses, diagnosis, medicines, etc.)
 * Requires a patientData input (the patient to add the visit to)
 */
@Component({
    selector: 'app-add-visit',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './add-visit.html',
    styleUrl: './add-visit.css'
})
export class AddVisitComponent implements OnChanges {
    @Input() patientData!: Patient;
    @Input() isEditMode: boolean = false;

    @Output() close = new EventEmitter<void>();
    @Output() visitAdded = new EventEmitter<string>();
    @Output() toggleEdit = new EventEmitter<void>();

    // Medical Information - Visit specific
    // Present Illness chips
    presentIllnesses: DynamicField[] = [];
    newIllnessInput: string = '';
    // Chief Complaints chips
    chiefComplaints: DynamicField[] = [];
    newComplaintInput: string = '';
    // Allergies & Ailments
    existingAllergies: string[] = [];
    newAllergyInput: string = '';
    existingAilments: string[] = [];
    newAilmentInput: string = '';
    // Other fields
    diagnosis: string = '';
    examinations: Examination[] = [];
    newExamTestName: string = '';
    newExamResult: string = '';
    treatmentPlan: string = '';
    advice: string = '';
    // Medicine chip inputs
    medicines: Medicine[] = [];
    newMedicineName: string = '';
    newMedicineDosage: string = '';
    newMedicineFrequency: string = '';

    errorMessage: string = '';
    successMessage: string = '';
    isSubmitting: boolean = false;

    private readonly patientService = inject(PatientService);
    private readonly ngZone = inject(NgZone);

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['patientData'] && this.patientData) {
            this.initializeAllergies();
            this.resetVisitForm();
        }
    }

    private initializeAllergies(): void {
        if (this.patientData?.allergies) {
            this.existingAllergies = this.patientData.allergies
                .split(',')
                .map(a => a.trim())
                .filter(a => a.length > 0);
        } else {
            this.existingAllergies = [];
        }
        this.newAllergyInput = '';

        if (this.patientData?.ailments) {
            this.existingAilments = this.patientData.ailments
                .split(',')
                .map(a => a.trim())
                .filter(a => a.length > 0);
        } else {
            this.existingAilments = [];
        }
        this.newAilmentInput = '';
    }

    private resetVisitForm(): void {
        this.presentIllnesses = [];
        this.newIllnessInput = '';
        this.chiefComplaints = [];
        this.newComplaintInput = '';
        this.diagnosis = '';
        this.examinations = [];
        this.newExamTestName = '';
        this.newExamResult = '';
        this.medicines = [];
        this.newMedicineName = '';
        this.newMedicineDosage = '';
        this.newMedicineFrequency = '';
        this.treatmentPlan = '';
        this.advice = '';

        this.errorMessage = '';
        this.successMessage = '';
    }

    // ── Present Illness chips ──
    onIllnessKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            const trimmed = this.newIllnessInput.trim();
            if (trimmed) {
                this.presentIllnesses.push({ description: trimmed });
                this.newIllnessInput = '';
            }
        }
    }

    removeIllness(index: number): void {
        this.presentIllnesses.splice(index, 1);
    }

    // ── Chief Complaints chips ──
    onComplaintKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            const trimmed = this.newComplaintInput.trim();
            if (trimmed) {
                this.chiefComplaints.push({ description: trimmed });
                this.newComplaintInput = '';
                if (this.errorMessage === 'Chief complaints is required') {
                    this.errorMessage = '';
                }
            }
        }
    }

    removeChiefComplaint(index: number): void {
        this.chiefComplaints.splice(index, 1);
    }

    // ── Allergies chips ──
    addNewAllergy(): void {
        const trimmed = this.newAllergyInput.trim();
        if (trimmed && !this.existingAllergies.includes(trimmed)) {
            this.existingAllergies.push(trimmed);
        }
        this.newAllergyInput = '';
    }

    removeAllergy(index: number): void {
        this.existingAllergies.splice(index, 1);
    }

    onAllergyKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.addNewAllergy();
        }
    }

    // ── Ailments chips ──
    addNewAilment(): void {
        const trimmed = this.newAilmentInput.trim();
        if (trimmed && !this.existingAilments.includes(trimmed)) {
            this.existingAilments.push(trimmed);
        }
        this.newAilmentInput = '';
    }

    removeAilment(index: number): void {
        this.existingAilments.splice(index, 1);
    }

    onAilmentKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.addNewAilment();
        }
    }

    // ── Medicine chips ──
    addMedicineChip(): void {
        const name = this.newMedicineName.trim();
        if (!name) return;
        this.medicines.push({
            name,
            dosage: this.newMedicineDosage.trim(),
            frequency: this.newMedicineFrequency.trim()
        });
        this.newMedicineName = '';
        this.newMedicineDosage = '';
        this.newMedicineFrequency = '';
    }

    onMedicineKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.addMedicineChip();
        }
    }

    removeMedicine(index: number): void {
        this.medicines.splice(index, 1);
    }

    // ── Examinations chips ──
    addExaminationChip(): void {
        const name = this.newExamTestName.trim();
        if (!name) return;
        this.examinations.push({ testName: name, result: this.newExamResult.trim() });
        this.newExamTestName = '';
        this.newExamResult = '';
    }

    onExaminationKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.addExaminationChip();
        }
    }

    removeExamination(index: number): void {
        this.examinations.splice(index, 1);
    }

    async onSubmit(): Promise<void> {
        this.errorMessage = '';
        this.successMessage = '';

        if (!this.validateForm()) {
            return;
        }

        this.isSubmitting = true;

        try {
            const patientId = this.patientData.uniqueId;

            // Update patient info if in edit mode
            if (this.isEditMode) {
                const patientUpdateData: any = {
                    name: this.patientData.name,
                    phone: this.patientData.phone
                };
                if (this.patientData.email) patientUpdateData.email = this.patientData.email;
                if (this.patientData.dateOfBirth) patientUpdateData.dateOfBirth = this.patientData.dateOfBirth;
                if (this.patientData.gender) patientUpdateData.gender = this.patientData.gender;

                await this.patientService.updatePatient(patientId, patientUpdateData);
            }

            // Always update allergies (combines existing + newly added)
            const allergiesText = this.existingAllergies.join(', ');
            if (allergiesText !== (this.patientData?.allergies || '').trim()) {
                await this.patientService.updatePatient(patientId, { allergies: allergiesText });
            }

            // Always update ailments (combines existing + newly added)
            const ailmentsText = this.existingAilments.join(', ');
            if (ailmentsText !== (this.patientData?.ailments || '').trim()) {
                await this.patientService.updatePatient(patientId, { ailments: ailmentsText });
            }

            // Save visit data
            const visitData: any = {
                chiefComplaints: this.formatArrayField(this.chiefComplaints),
                diagnosis: this.diagnosis.trim(),
                examination: this.formatExaminations(),
                treatmentPlan: this.treatmentPlan.trim(),
                advice: this.advice.trim()
            };
            const presentIllnessText = this.formatArrayField(this.presentIllnesses);
            if (presentIllnessText) visitData.presentIllness = presentIllnessText;
            const medicinesText = this.formatMedicines();
            if (medicinesText) visitData.medicines = medicinesText;

            await this.patientService.addVisit(patientId, visitData);

            // Success - close form first, then show popup
            this.isSubmitting = false;

            // Emit so parent component can refresh
            this.visitAdded.emit(patientId);

            // Close the form immediately
            this.onClose();

            // Show success popup AFTER form closes
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
        } catch (error: any) {
            console.error('Error in onSubmit:', error);
            this.isSubmitting = false;

            const errorMessage = error?.message || 'An unexpected error occurred';
            this.errorMessage = `Failed to save visit: ${errorMessage}`;
        }
    }

    validateForm(): boolean {
        if (this.chiefComplaints.length === 0) {
            this.errorMessage = 'Chief complaints is required';
            return false;
        }

        return true;
    }

    private formatArrayField(fields: DynamicField[]): string {
        return fields
            .map(f => f.description.trim())
            .filter(d => d.length > 0)
            .join(', ');
    }

    private formatExaminations(): string {
        return this.examinations
            .filter(e => e.testName.trim() || e.result.trim())
            .map(e => `${e.testName.trim()}: ${e.result.trim()}`)
            .join(', ');
    }

    private formatMedicines(): string {
        return this.medicines
            .filter(m => m.name.trim() || m.dosage.trim() || m.frequency.trim())
            .map(m => {
                const parts = [m.name.trim()];
                if (m.dosage.trim()) parts.push(m.dosage.trim());
                if (m.frequency.trim()) parts.push(m.frequency.trim());
                return parts.join(' - ');
            })
            .join(', ');
    }

    isFieldReadonly(field: string): boolean {
        if (this.isEditMode) return false;

        const readonlyFields = ['firstName', 'lastName', 'phone', 'dateOfBirth', 'gender', 'email'];
        return readonlyFields.includes(field);
    }

    getPatientAge(): number | null {
        if (!this.patientData?.dateOfBirth) return null;
        const dob = new Date(this.patientData.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
    }

    onToggleEdit(): void {
        this.toggleEdit.emit();
    }

    onClose(): void {
        this.close.emit();
    }
}