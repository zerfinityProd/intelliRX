import { Component, OnInit, OnDestroy, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../services/patient';
import Swal from 'sweetalert2';

interface DynamicField {
  description: string;
}

/**
 * AddPatientComponent: Handles ONLY new patient creation
 * Responsible for: Basic patient information (name, contact, DOB, gender, etc.)
 * Does NOT handle visits - use AddVisitComponent for that
 */
@Component({
  selector: 'app-add-patient',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-patient.html',
  styleUrl: './add-patient.css'
})
export class AddPatientComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Output() patientAdded = new EventEmitter<string>();

  // Basic Information
  firstName: string = '';
  lastName: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  email: string = '';
  gender: string = '';
  familyId: string = '';

  // Patient allergies on initial creation
  allergies: DynamicField[] = [{ description: '' }];

  todayDate: string = new Date().toISOString().split('T')[0];

  errorMessage: string = '';
  successMessage: string = '';
  warningMessage: string = '';
  isSubmitting: boolean = false;

  private checkDebounceTimer: any = null;
  private readonly patientService = inject(PatientService);

  ngOnInit(): void {
    this.resetForm();
  }

  ngOnDestroy(): void {
    // Clean up the debounce timer
    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }
  }

  private resetForm(): void {
    this.firstName = '';
    this.lastName = '';
    this.phone = '';
    this.dateOfBirth = '';
    this.email = '';
    this.gender = '';
    this.familyId = '';
    this.allergies = [{ description: '' }];
    this.errorMessage = '';
    this.successMessage = '';
    this.warningMessage = '';
  }

  onNameChange(): void {
    this.updateFamilyId();
  }

  onPhoneChange(): void {
    this.updateFamilyId();
  }

  private async updateFamilyId(): Promise<void> {
    const fullName = `${this.firstName.trim()} ${this.lastName.trim()}`.trim();
    const phoneNumber = this.phone.trim();

    // Always generate family ID, even if partial
    this.familyId = this.generateFamilyIdPreview(fullName, phoneNumber);

    // Clear any pending check
    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }

    // Check if patient already exists
    if (fullName && phoneNumber && phoneNumber.length === 10) {
      // Debounce the check by 300ms to avoid excessive API calls
      this.checkDebounceTimer = setTimeout(async () => {
        try {
          const exists = await this.patientService.checkUniqueIdExists(fullName, phoneNumber);

          if (exists) {
            this.warningMessage = '⚠️ This patient already exists in the system';
          } else {
            this.warningMessage = '';
          }
        } catch (error) {
          console.error('Error checking unique ID:', error);
          this.warningMessage = '';
        }
      }, 300);
    } else {
      // Clear warning if conditions not met
      this.warningMessage = '';
    }
  }

  clearSuccessMessage(): void {
    if (this.successMessage) {
      this.successMessage = '';
    }
    if (this.errorMessage) {
      this.errorMessage = '';
    }
    if (this.warningMessage) {
      this.warningMessage = '';
    }
  }

  private generateFamilyIdPreview(name: string, phone: string): string {
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    const cleanPhone = phone.trim();

    // Need at least both first and last name to generate family ID
    if (nameParts.length < 2) return '';

    const lastName = nameParts[nameParts.length - 1].toLowerCase();

    return cleanPhone ? `${lastName}_${cleanPhone}` : lastName;
  }

  addAllergy(): void {
    this.allergies.push({ description: '' });
  }

  removeAllergy(index: number): void {
    if (this.allergies.length > 1) {
      this.allergies.splice(index, 1);
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    // Check if patient already exists
    if (this.warningMessage) {
      this.errorMessage = 'This patient already exists. Please search for the existing patient to add a new visit.';
      return;
    }

    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;

    try {
      // Create new patient
      const patientData: any = {
        name: `${this.firstName.trim()} ${this.lastName.trim()}`,
        phone: this.phone.trim()
      };
      if (this.email.trim()) patientData.email = this.email.trim();
      if (this.dateOfBirth) patientData.dateOfBirth = new Date(this.dateOfBirth);
      if (this.gender) patientData.gender = this.gender;
      const allergiesText = this.formatArrayField(this.allergies);
      if (allergiesText) patientData.allergies = allergiesText;

      const patientId = await this.patientService.createPatient(patientData);

      // Success - close form first, then show popup
      this.isSubmitting = false;

      // Emit so parent component can refresh
      this.patientAdded.emit(patientId);

      // Close the form immediately
      this.onClose();

      // Show success popup AFTER form closes
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      await Swal.fire({
        title: 'Patient Added Successfully!',
        text: 'The patient has been added to the system.',
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
      this.errorMessage = `Failed to save patient: ${errorMessage}`;
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

    if (this.dateOfBirth) {
      const year = new Date(this.dateOfBirth).getFullYear();
      if (year > 9999 || year < 1000) {
        this.errorMessage = 'Please enter a valid year (4 digits)';
        return false;
      }
      if (this.dateOfBirth > this.todayDate) {
        this.errorMessage = 'Date of birth cannot be a future date';
        return false;
      }
    }

    return true;
  }

  private formatArrayField(fields: DynamicField[]): string {
    return fields
      .map(f => f.description.trim())
      .filter(d => d.length > 0)
      .join(', ');
  }

  onClose(): void {
    this.close.emit();
  }
}