import { Component, OnInit, OnDestroy, OnChanges, Output, EventEmitter, Input, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PatientService } from '../../services/patient';
import { ClinicContextService } from '../../services/clinicContextService';
import { todayLocalISO } from '../../utilities/local-date';

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

  // Optional prefill values (used when opening Add Patient from Appointment cards)
  @Input() prefillName: string = '';
  @Input() prefillPhone: string = '';
  @Input() prefillAilments: string = '';

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

  todayDate: string = todayLocalISO();

  errorMessage: string = '';
  successMessage: string = '';
  warningMessage: string = '';
  isSubmitting: boolean = false;

  private checkDebounceTimer: any = null;
  private readonly patientService = inject(PatientService);
  private readonly clinicContextService = inject(ClinicContextService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.resetForm();
    this.applyPrefill();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If prefill changes while modal is open, apply again.
    if ((changes['prefillName'] || changes['prefillPhone'] || changes['prefillAilments'])
      && (this.showPrefillAllowed() || this.ailmentChips.length === 0)) {
      this.applyPrefill();
    }
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

  private showPrefillAllowed(): boolean {
    // Only apply prefill when fields are still empty (or the component was just opened).
    const hasUserInput = this.firstName.trim() || this.lastName.trim() || this.phone.trim();
    return !hasUserInput;
  }

  private applyPrefill(): void {
    const name = (this.prefillName || '').trim();
    const phone = (this.prefillPhone || '').trim();
    const prefillAilmentsText = (this.prefillAilments || '').trim();

    if (!name && !phone && !prefillAilmentsText) return;

    if (phone && !this.phone.trim()) {
      this.phone = phone;
    }

    if (name && !this.firstName.trim() && !this.lastName.trim()) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        this.firstName = parts[0];
        this.lastName = '';
        this.middleName = '';
      } else {
        this.firstName = parts[0];
        this.lastName = parts[parts.length - 1];
        this.middleName = parts.slice(1, parts.length - 1).join(' ');
      }
    }

    // Prefill ailment chips (do not overwrite if user already added ailments).
    if (prefillAilmentsText && this.ailmentChips.length === 0) {
      const parsed = prefillAilmentsText
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);
      this.ailmentChips = parsed;
    }

    // Recompute preview familyId + (optionally) uniqueness warning.
    void this.updateFamilyId();
    this.cdr.detectChanges();
  }

  onNameChange(): void {
    this.updateFamilyId();
  }

  onPhoneChange(): void {
    this.updateFamilyId();
  }

  private async updateFamilyId(): Promise<void> {
    const fullName = [this.firstName.trim(), this.middleName.trim(), this.lastName.trim()]
      .filter(p => p).join(' ');
    const phoneNumber = this.phone.trim();

    this.familyId = this.generateFamilyIdPreview(fullName, phoneNumber);

    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }

    // Only check when we have a name and a valid 10-digit phone
    if (fullName && phoneNumber && phoneNumber.length === 10) {
      this.checkDebounceTimer = setTimeout(async () => {
        try {
          // Search by phone number (multiple fallback strategies for reliability)
          const phoneMatch = await this.patientService.findPatientByPhone(phoneNumber);
          if (phoneMatch) {
            const existingName = phoneMatch.name.trim().toLowerCase();
            const enteredName = fullName.trim().toLowerCase();
            if (existingName === enteredName) {
              this.warningMessage = '⚠️ This patient already exists in the system';
            } else {
              this.warningMessage = `⚠️ A patient "${phoneMatch.name}" already exists with this phone number`;
            }
          } else {
            this.warningMessage = '';
          }
          this.cdr.detectChanges();
        } catch (error) {
          console.error('Error checking for duplicate patient:', error);
          this.warningMessage = '';
          this.cdr.detectChanges();
        }
      }, 300);
    } else {
      this.warningMessage = '';
    }
  }

  clearSuccessMessage(): void {
    if (this.successMessage) this.successMessage = '';
    if (this.errorMessage) this.errorMessage = '';
    // Note: warningMessage is NOT cleared here — it is managed exclusively
    // by updateFamilyId() to preserve duplicate-patient warnings.
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

      const patientId = await this.patientService.createPatient({
        ...patientData,
        clinicId: this.clinicContextService.getSelectedClinicId() || undefined
      });

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