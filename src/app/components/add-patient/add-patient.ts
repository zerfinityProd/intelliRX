import { Component, OnInit, OnDestroy, Output, EventEmitter, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PatientService } from '../../services/patient';

// SweetAlert2 is NOT imported at the top level.
// It is dynamically imported only when a dialog is actually needed,
// keeping it out of the initial JS bundle (~934ms CPU saving).

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
  middleName: string = '';
  lastName: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  email: string = '';
  gender: string = '';
  familyId: string = '';

  // Patient allergies & ailments as chips
  allergyChips: string[] = [];
  newAllergyInput: string = '';
  ailmentChips: string[] = [];
  newAilmentInput: string = '';

  todayDate: string = new Date().toISOString().split('T')[0];

  errorMessage: string = '';
  successMessage: string = '';
  warningMessage: string = '';
  isSubmitting: boolean = false;

  private checkDebounceTimer: any = null;
  private readonly patientService = inject(PatientService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.resetForm();
  }

  ngOnDestroy(): void {
    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }
  }

  private resetForm(): void {
    this.firstName = '';
    this.middleName = '';
    this.lastName = '';
    this.phone = '';
    this.dateOfBirth = '';
    this.email = '';
    this.gender = '';
    this.familyId = '';
    this.allergyChips = [];
    this.newAllergyInput = '';
    this.ailmentChips = [];
    this.newAilmentInput = '';
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

    this.familyId = this.generateFamilyIdPreview(fullName, phoneNumber);

    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }

    if (fullName && phoneNumber && phoneNumber.length === 10) {
      this.checkDebounceTimer = setTimeout(async () => {
        try {
          const exists = await this.patientService.checkUniqueIdExists(fullName, phoneNumber);
          if (exists) {
            this.warningMessage = '⚠️ This patient already exists in the system';
          } else {
            this.warningMessage = '';
          }
          this.cdr.detectChanges();
        } catch (error) {
          console.error('Error checking unique ID:', error);
          this.warningMessage = '';
        }
      }, 0);
    } else {
      this.warningMessage = '';
    }
  }

  clearSuccessMessage(): void {
    if (this.successMessage) this.successMessage = '';
    if (this.errorMessage) this.errorMessage = '';
    if (this.warningMessage) this.warningMessage = '';
  }

  private generateFamilyIdPreview(name: string, phone: string): string {
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    const cleanPhone = phone.trim();
    if (nameParts.length < 2) return '';
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    return cleanPhone ? `${lastName}_${cleanPhone}` : lastName;
  }

  // ── Allergy chips ──
  onAllergyKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = this.newAllergyInput.trim();
      if (trimmed && !this.allergyChips.includes(trimmed)) {
        this.allergyChips.push(trimmed);
        this.newAllergyInput = '';
      }
    }
  }

  onAllergyBlur(): void {
    const trimmed = this.newAllergyInput.trim();
    if (trimmed && !this.allergyChips.includes(trimmed)) {
      this.allergyChips.push(trimmed);
      this.newAllergyInput = '';
    }
  }

  removeAllergy(index: number): void {
    this.allergyChips.splice(index, 1);
  }

  // ── Ailment chips ──
  onAilmentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = this.newAilmentInput.trim();
      if (trimmed && !this.ailmentChips.includes(trimmed)) {
        this.ailmentChips.push(trimmed);
        this.newAilmentInput = '';
      }
    }
  }

  onAilmentBlur(): void {
    const trimmed = this.newAilmentInput.trim();
    if (trimmed && !this.ailmentChips.includes(trimmed)) {
      this.ailmentChips.push(trimmed);
      this.newAilmentInput = '';
    }
  }

  removeAilment(index: number): void {
    this.ailmentChips.splice(index, 1);
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (this.warningMessage) {
      this.errorMessage = 'This patient already exists. Please search for the existing patient to add a new visit.';
      return;
    }

    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;

    try {
      const patientData: any = {
        name: [this.firstName.trim(), this.middleName.trim(), this.lastName.trim()].filter(p => p).join(' '),
        phone: this.phone.trim()
      };
      if (this.email.trim()) patientData.email = this.email.trim();
      if (this.dateOfBirth) patientData.dateOfBirth = new Date(this.dateOfBirth);
      if (this.gender) patientData.gender = this.gender;
      const allergiesText = this.allergyChips.join(', ');
      if (allergiesText) patientData.allergies = allergiesText;
      const ailmentsText = this.ailmentChips.join(', ');
      if (ailmentsText) patientData.ailments = ailmentsText;

      const patientId = await this.patientService.createPatient(patientData);

      this.isSubmitting = false;
      this.patientAdded.emit(patientId);
      this.onClose();

      // Dynamically import Swal only at the point it is needed
      const { default: Swal } = await import('sweetalert2');
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const result = await Swal.fire({
        title: 'Patient Added Successfully!',
        icon: 'success',
        showConfirmButton: true,
        confirmButtonText: 'Add Visit',
        confirmButtonColor: '#6366f1',
        showDenyButton: true,
        denyButtonText: 'OK',
        denyButtonColor: '#94a3b8',
        timer: 2000,
        timerProgressBar: true,
        background: isDark ? '#1f1f1f' : '#ffffff',
        color: isDark ? '#e0e0e0' : '#1e293b',
      });

      if (result.isConfirmed) {
        this.router.navigate(['/patient', patientId, 'add-visit'], { state: { origin: 'home' } });
      }
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

  onClose(): void {
    const hasData = this.firstName.trim() || this.lastName.trim() || this.phone.trim() ||
        this.middleName.trim() || this.email.trim() || this.dateOfBirth ||
        this.gender || this.allergyChips.length || this.ailmentChips.length;

    if (hasData) {
      // Dynamically import Swal only when the dialog is actually needed
      import('sweetalert2').then(({ default: Swal }) => {
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
            this.close.emit();
          }
        });
      });
    } else {
      this.close.emit();
    }
  }
}