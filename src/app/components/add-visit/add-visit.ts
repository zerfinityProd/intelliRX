import { Component, Input, Output, EventEmitter, NgZone, inject } from '@angular/core';
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
export class AddVisitComponent {
    @Input() patientData!: Patient;
    @Input() isEditMode: boolean = false;

    @Output() close = new EventEmitter<void>();
    @Output() visitAdded = new EventEmitter<string>();
    @Output() toggleEdit = new EventEmitter<void>();

    // Medical Information - Visit specific
    presentIllnesses: DynamicField[] = [{ description: '' }];
    existingAllergies: DynamicField[] = [];
    newAllergies: DynamicField[] = [{ description: '' }];
    chiefComplaints: DynamicField[] = [{ description: '' }];
    diagnosis: string = '';
    examinations: Examination[] = [{ testName: '', result: '' }];
    medicines: Medicine[] = [{ name: '', dosage: '', frequency: '' }];
    treatmentPlan: string = '';
    advice: string = '';

    errorMessage: string = '';
    successMessage: string = '';
    isSubmitting: boolean = false;

    private readonly patientService = inject(PatientService);
    private readonly ngZone = inject(NgZone);

    constructor() {
        this.initializeForm();
    }

    private initializeForm(): void {
        if (this.patientData?.allergies) {
            this.existingAllergies = this.patientData.allergies
                .split(',')
                .map(a => a.trim())
                .filter(a => a.length > 0)
                .map(a => ({ description: a }));

            if (this.existingAllergies.length === 0) {
                this.existingAllergies = [{ description: '' }];
            }
        }

        this.newAllergies = [{ description: '' }];
        this.resetVisitForm();
    }

    private resetVisitForm(): void {
        this.presentIllnesses = [{ description: '' }];
        this.chiefComplaints = [{ description: '' }];
        this.diagnosis = '';
        this.examinations = [{ testName: '', result: '' }];
        this.medicines = [{ name: '', dosage: '', frequency: '' }];
        this.treatmentPlan = '';
        this.advice = '';

        this.errorMessage = '';
        this.successMessage = '';
    }

    addIllness(): void {
        this.presentIllnesses.push({ description: '' });
    }

    removeIllness(index: number): void {
        if (this.presentIllnesses.length > 1) {
            this.presentIllnesses.splice(index, 1);
        }
    }

    addAllergy(): void {
        if (this.isEditMode) {
            this.existingAllergies.push({ description: '' });
        } else {
            this.newAllergies.push({ description: '' });
        }
    }

    removeAllergy(index: number): void {
        if (this.isEditMode) {
            if (this.existingAllergies.length > 1) {
                this.existingAllergies.splice(index, 1);
            }
        } else {
            if (this.newAllergies.length > 1) {
                this.newAllergies.splice(index, 1);
            }
        }
    }

    removeExistingAllergy(index: number): void {
        if (this.existingAllergies.length > 1) {
            this.existingAllergies.splice(index, 1);
        }
    }

    removeNewAllergy(index: number): void {
        if (this.newAllergies.length > 1) {
            this.newAllergies.splice(index, 1);
        }
    }

    addChiefComplaint(): void {
        this.chiefComplaints.push({ description: '' });
    }

    removeChiefComplaint(index: number): void {
        if (this.chiefComplaints.length > 1) {
            this.chiefComplaints.splice(index, 1);
        }
    }

    addExamination(): void {
        this.examinations.push({ testName: '', result: '' });
    }

    removeExamination(index: number): void {
        if (this.examinations.length > 1) {
            this.examinations.splice(index, 1);
        }
    }

    addMedicine(): void {
        this.medicines.push({ name: '', dosage: '', frequency: '' });
    }

    removeMedicine(index: number): void {
        if (this.medicines.length > 1) {
            this.medicines.splice(index, 1);
        }
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

                const allAllergies = this.combineAllergies();
                const allergiesText = this.formatArrayField(allAllergies);
                if (allergiesText !== this.patientData?.allergies) {
                    await this.patientService.updatePatient(patientId, { allergies: allergiesText });
                }
            } else {
                // Add allergies if not in edit mode
                const allAllergies = this.combineAllergies();
                const allergiesText = this.formatArrayField(allAllergies);
                if (allergiesText && allergiesText !== this.patientData?.allergies) {
                    await this.patientService.updatePatient(patientId, { allergies: allergiesText });
                }
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
        const hasChiefComplaints = this.formatArrayField(this.chiefComplaints).length > 0;
        if (!hasChiefComplaints) {
            this.errorMessage = 'Chief complaints is required';
            return false;
        }

        return true;
    }

    private combineAllergies(): DynamicField[] {
        const combined = [...this.existingAllergies];
        const newWithContent = this.newAllergies.filter(a => a.description.trim().length > 0);
        combined.push(...newWithContent);
        return combined;
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

    onToggleEdit(): void {
        this.toggleEdit.emit();
    }

    onClose(): void {
        this.close.emit();
    }
}