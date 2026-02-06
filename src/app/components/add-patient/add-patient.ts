
import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../services/patient';

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

@Component({
  selector: 'app-add-patient',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-patient.html',
  styleUrl: './add-patient.css'
})
export class AddPatientComponent {
  @Output() close = new EventEmitter<void>();
  @Output() patientAdded = new EventEmitter<string>();

  // Basic Information
  firstName: string = '';
  lastName: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  email: string = '';
  gender: string = '';
  familyId: string = ''; // Auto-generated field

  // Medical Information
  presentIllnesses: DynamicField[] = [{ description: '' }];
  allergies: DynamicField[] = [{ description: '' }];
  chiefComplaints: DynamicField[] = [{ description: '' }];
  diagnosis: string = '';
  examinations: Examination[] = [{ testName: '', result: '' }];
  medicines: Medicine[] = [{ name: '', dosage: '', frequency: '' }];
  treatmentPlan: string = '';
  advice: string = '';

  errorMessage: string = '';
  successMessage: string = '';
  isSubmitting: boolean = false;

  constructor(private patientService: PatientService) {}

  /**
   * Update family ID whenever first or last name changes
   */
  onNameChange(): void {
    if (this.firstName.trim() || this.lastName.trim()) {
      const fullName = `${this.firstName.trim()} ${this.lastName.trim()}`.trim();
      if (fullName) {
        this.familyId = this.generateFamilyIdPreview(fullName);
      } else {
        this.familyId = '';
      }
    } else {
      this.familyId = '';
    }
  }

  /**
   * Clear success message when user starts typing again
   */
  clearSuccessMessage(): void {
    if (this.successMessage) {
      this.successMessage = '';
    }
  }

  /**
   * Generate family ID preview (same logic as backend)
   */
  private generateFamilyIdPreview(name: string): string {
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    
    if (nameParts.length === 0) {
      return '';
    }
    
    if (nameParts.length === 1) {
      return nameParts[0].toLowerCase();
    }
    
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    return `${lastName}_${firstName}`;
  }

  // Dynamic Field Management
  addIllness(): void {
    this.presentIllnesses.push({ description: '' });
  }

  removeIllness(index: number): void {
    if (this.presentIllnesses.length > 1) {
      this.presentIllnesses.splice(index, 1);
    }
  }

  addAllergy(): void {
    this.allergies.push({ description: '' });
  }

  removeAllergy(index: number): void {
    if (this.allergies.length > 1) {
      this.allergies.splice(index, 1);
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

    // Validation
    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;

    try {
      const fullName = `${this.firstName.trim()} ${this.lastName.trim()}`;
      
      // Prepare patient data - only include optional fields if they have values
      const patientData: any = {
        name: fullName,
        phone: this.phone.trim(),
        presentIllness: this.formatArrayField(this.presentIllnesses)
      };

      // Add optional fields only if they have values
      if (this.email.trim()) {
        patientData.email = this.email.trim();
      }
      
      if (this.dateOfBirth) {
        patientData.dateOfBirth = new Date(this.dateOfBirth);
      }
      
      if (this.gender) {
        patientData.gender = this.gender;
      }

      // ✅ FIX: Add allergies to patient data
      const allergiesText = this.formatArrayField(this.allergies);
      if (allergiesText) {
        patientData.allergies = allergiesText;
      }

      // Create patient
      const patientId = await this.patientService.createPatient(patientData);

      // Add initial visit if medical data is provided
      if (this.hasVisitData()) {
        const visitData: any = {
          chiefComplaints: this.formatArrayField(this.chiefComplaints),
          diagnosis: this.diagnosis.trim(),
          examination: this.formatExaminations(),
          treatmentPlan: this.treatmentPlan.trim(),
          advice: this.advice.trim()
        };

        // ✅ FIX: Add medicines to visit data
        const medicinesText = this.formatMedicines();
        if (medicinesText) {
          visitData.medicines = medicinesText;
        }

        await this.patientService.addVisit(patientId, visitData);
      }

      // CRITICAL: Stop loading state FIRST so button returns to normal
      this.isSubmitting = false;
      
      // THEN show success message (this displays on screen for doctor!)
      this.successMessage = 'Patient saved successfully!';
      
      console.log('SUCCESS MESSAGE SET:', this.successMessage);
      
      // Emit success event to parent
      this.patientAdded.emit(patientId);
      
      // Wait 2.5 seconds to show the success message
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Clear the form but keep modal open
      this.resetForm();
    } catch (error) {
      console.error('Error adding patient:', error);
      this.errorMessage = 'Failed to add patient. Please try again.';
      this.isSubmitting = false;
    }
  }

  validateForm(): boolean {
    if (!this.firstName.trim()) {
      this.errorMessage = 'First name is required';
      return false;
    }

    if (!this.lastName.trim()) {
      this.errorMessage = 'Last name is required';
      return false;
    }

    if (!this.phone.trim()) {
      this.errorMessage = 'Phone number is required';
      return false;
    }

    if (!this.patientService.isValidPhone(this.phone.trim())) {
      this.errorMessage = 'Please enter a valid 10-digit phone number';
      return false;
    }

    if (this.email.trim() && !this.patientService.isValidEmail(this.email.trim())) {
      this.errorMessage = 'Please enter a valid email address';
      return false;
    }

    return true;
  }

  formatArrayField(items: DynamicField[]): string {
    return items
      .map(item => item.description.trim())
      .filter(desc => desc.length > 0)
      .join(', ');
  }

  formatExaminations(): string {
    return this.examinations
      .filter(exam => exam.testName.trim() && exam.result.trim())
      .map(exam => `${exam.testName.trim()}: ${exam.result.trim()}`)
      .join(', ');
  }

  // ✅ NEW: Format medicines with name, dosage, and frequency
  formatMedicines(): string {
    return this.medicines
      .filter(med => med.name.trim()) // At least medicine name must be present
      .map(med => {
        const parts = [med.name.trim()];
        if (med.dosage.trim()) parts.push(med.dosage.trim());
        if (med.frequency.trim()) parts.push(med.frequency.trim());
        return parts.join(' - ');
      })
      .join(', ');
  }

  hasVisitData(): boolean {
    return (
      this.formatArrayField(this.chiefComplaints).length > 0 ||
      this.diagnosis.trim().length > 0 ||
      this.formatExaminations().length > 0 ||
      this.formatMedicines().length > 0 || // ✅ Added medicines check
      this.treatmentPlan.trim().length > 0 ||
      this.advice.trim().length > 0
    );
  }

  resetForm(): void {
    this.firstName = '';
    this.lastName = '';
    this.phone = '';
    this.dateOfBirth = '';
    this.email = '';
    this.gender = '';
    this.familyId = '';
    this.presentIllnesses = [{ description: '' }];
    this.allergies = [{ description: '' }];
    this.chiefComplaints = [{ description: '' }];
    this.diagnosis = '';
    this.examinations = [{ testName: '', result: '' }];
    this.medicines = [{ name: '', dosage: '', frequency: '' }];
    this.treatmentPlan = '';
    this.advice = '';
    this.errorMessage = '';
    // Don't clear successMessage - let it stay visible
    // this.successMessage = '';
  }

  onClose(): void {
    this.close.emit();
  }
}