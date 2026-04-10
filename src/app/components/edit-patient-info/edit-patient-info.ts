import { Component, EventEmitter, Output, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';

@Component({
  selector: 'app-edit-patient-info',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-patient-info.html',
  styleUrl: './edit-patient-info.css'
})
export class EditPatientInfoComponent implements OnInit, OnChanges {
  @Input() patientData: Patient | null = null;
  
  @Output() close = new EventEmitter<void>();
  @Output() patientUpdated = new EventEmitter<string>();

  // Basic Information
  firstName: string = '';
  lastName: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  email: string = '';
  gender: string = '';
  familyId: string = '';

  errorMessage: string = '';
  successMessage: string = '';
  isSubmitting: boolean = false;

  constructor(private patientService: PatientService) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patientData'] && this.patientData) {
      this.initializeForm();
    }
  }

  private initializeForm(): void {
    if (this.patientData) {
      // Split name into first and last
      const nameParts = this.patientData.name.trim().split(' ');
      this.firstName = nameParts[0] || '';
      this.lastName = nameParts.slice(1).join(' ') || '';
      
      this.phone = this.patientData.phone || '';
      this.email = this.patientData.email || '';
      this.gender = this.patientData.gender || '';
      
      // Format date for input
      if (this.patientData.dob) {
        const dob = this.patientData.dob;
        let dateStr: string;
        
        if (typeof dob === 'object' && 'toDate' in (dob as any)) {
          dateStr = (dob as any).toDate().toISOString().split('T')[0];
        } else {
          dateStr = new Date(dob).toISOString().split('T')[0];
        }
        
        this.dateOfBirth = dateStr;
      }
    }
  }

  onNameChange(): void {
    this.clearSuccessMessage();
  }

  clearSuccessMessage(): void {
    if (this.successMessage) {
      this.successMessage = '';
    }
  }

  private generateFamilyIdPreview(name: string): string {
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    
    if (nameParts.length === 0) return '';
    if (nameParts.length === 1) return nameParts[0].toLowerCase();
    
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();
    return `${lastName}_${firstName}`;
  }

  private validateForm(): boolean {
    this.errorMessage = '';

    const fullName = `${this.firstName.trim()} ${this.lastName.trim()}`.trim();
    if (!fullName || fullName.split(' ').length < 2) {
      this.errorMessage = 'Please enter both first and last name';
      return false;
    }

    if (!this.phone || this.phone.length !== 10) {
      this.errorMessage = 'Please enter a valid 10-digit phone number';
      return false;
    }

    if (this.email && !this.isValidEmail(this.email)) {
      this.errorMessage = 'Please enter a valid email address';
      return false;
    }

    return true;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.validateForm()) {
      return;
    }

    if (!this.patientData?.id) {
      this.errorMessage = 'Patient ID not found';
      return;
    }

    this.isSubmitting = true;

    try {
      const fullName = `${this.firstName.trim()} ${this.lastName.trim()}`.trim();
      
      const updatedPatient: Partial<Patient> = {
        name: fullName,
        phone: this.phone,
        email: this.email || '',
        gender: this.gender || '',
        dob: this.dateOfBirth || undefined
      };

      await this.patientService.updatePatient(this.patientData.id, updatedPatient);
      
      this.successMessage = 'Patient information updated successfully!';
      this.isSubmitting = false;

      // Emit the patient ID to refresh the parent component
      setTimeout(() => {
        this.patientUpdated.emit(this.patientData!.id);
        this.onClose();
      }, 1000);

    } catch (error) {
      console.error('Error updating patient:', error);
      this.errorMessage = 'Failed to update patient information. Please try again.';
      this.isSubmitting = false;
    }
  }

  onClose(): void {
    this.close.emit();
  }
}