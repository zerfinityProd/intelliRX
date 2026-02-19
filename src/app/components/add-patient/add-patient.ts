import { Component, OnInit, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, NgZone } from '@angular/core';
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

interface SaveData {
  isNewVisit: boolean;
  presentIllnesses: DynamicField[];
  existingAllergies: DynamicField[];
  newAllergies: DynamicField[];
  chiefComplaints: DynamicField[];
  diagnosis: string;
  examinations: Examination[];
  medicines: Medicine[];
  treatmentPlan: string;
  advice: string;
  originalAllergies?: string;
}

@Component({
  selector: 'app-add-patient',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-patient.html',
  styleUrl: './add-patient.css'
})
export class AddPatientComponent implements OnInit, OnChanges, OnDestroy {
  @Input() patientData: Patient | null = null;
  @Input() isEditMode: boolean = false;
  
  @Output() close = new EventEmitter<void>();
  @Output() patientAdded = new EventEmitter<string>();
  @Output() toggleEdit = new EventEmitter<void>();

  // Basic Information
  firstName: string = '';
  lastName: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  email: string = '';
  gender: string = '';
  familyId: string = '';

  // Medical Information - Visit specific
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
  warningMessage: string = '';
  isSubmitting: boolean = false;
  
  private checkDebounceTimer: any = null;

  isNewVisit: boolean = false;
  
  existingAllergies: DynamicField[] = [];
  newAllergies: DynamicField[] = [{ description: '' }];

  constructor(
    private patientService: PatientService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patientData'] && this.patientData) {
      this.initializeForm();
    }
  }

  ngOnDestroy(): void {
    // Clean up the debounce timer
    if (this.checkDebounceTimer) {
      clearTimeout(this.checkDebounceTimer);
    }
  }

  private initializeForm(): void {
    if (this.patientData) {
      this.isNewVisit = true;
      
      const nameParts = this.patientData.name.trim().split(' ');
      this.firstName = nameParts[0] || '';
      this.lastName = nameParts.slice(1).join(' ') || '';
      this.phone = this.patientData.phone || '';
      this.email = this.patientData.email || '';
      this.gender = this.patientData.gender || '';
      this.familyId = this.patientData.familyId || '';
      
      if (this.patientData.dateOfBirth) {
        const dob = this.patientData.dateOfBirth instanceof Date 
          ? this.patientData.dateOfBirth 
          : new Date(this.patientData.dateOfBirth);
        this.dateOfBirth = dob.toISOString().split('T')[0];
      }
      
      if (this.patientData.allergies) {
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
    } else {
      this.isNewVisit = false;
      this.resetForm();
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
    
    this.presentIllnesses = [{ description: '' }];
    this.allergies = [{ description: '' }];
    this.chiefComplaints = [{ description: '' }];
    this.diagnosis = '';
    this.examinations = [{ testName: '', result: '' }];
    this.medicines = [{ name: '', dosage: '', frequency: '' }];
    this.treatmentPlan = '';
    this.advice = '';
    
    this.existingAllergies = [];
    this.newAllergies = [{ description: '' }];
    
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
    
    // Check if patient already exists (only for new patients, not for visits)
    if (!this.isNewVisit && fullName && phoneNumber && phoneNumber.length === 10) {
      // Debounce the check by 300ms to avoid excessive API calls
      this.checkDebounceTimer = setTimeout(async () => {
        try {
          const exists = await this.patientService.checkUniqueIdExists(fullName, phoneNumber);
          
          // Use NgZone to ensure UI updates
          this.ngZone.run(() => {
            if (exists) {
              this.warningMessage = '⚠️ This patient already exists in the system';
            } else {
              this.warningMessage = '';
            }
          });
        } catch (error) {
          console.error('Error checking unique ID:', error);
          this.ngZone.run(() => {
            this.warningMessage = '';
          });
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

  addIllness(): void {
    this.presentIllnesses.push({ description: '' });
  }

  removeIllness(index: number): void {
    if (this.presentIllnesses.length > 1) {
      this.presentIllnesses.splice(index, 1);
    }
  }

  addAllergy(): void {
    if (this.isNewVisit) {
      if (this.isEditMode) {
        this.existingAllergies.push({ description: '' });
      } else {
        this.newAllergies.push({ description: '' });
      }
    } else {
      this.allergies.push({ description: '' });
    }
  }

  removeAllergy(index: number): void {
    if (this.isNewVisit) {
      if (this.isEditMode) {
        if (this.existingAllergies.length > 1) {
          this.existingAllergies.splice(index, 1);
        }
      } else {
        if (this.newAllergies.length > 1) {
          this.newAllergies.splice(index, 1);
        }
      }
    } else {
      if (this.allergies.length > 1) {
        this.allergies.splice(index, 1);
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
      let patientId: string;

      if (this.isNewVisit && this.patientData) {
        // Existing patient: visit
        patientId = this.patientData.uniqueId;

        if (this.isEditMode) {
          const patientUpdateData: any = {
            name: `${this.firstName.trim()} ${this.lastName.trim()}`,
            phone: this.phone.trim()
          };
          if (this.email.trim()) patientUpdateData.email = this.email.trim();
          if (this.dateOfBirth)  patientUpdateData.dateOfBirth = new Date(this.dateOfBirth);
          if (this.gender)       patientUpdateData.gender = this.gender;

          await this.patientService.updatePatient(patientId, patientUpdateData);

          const allAllergies = this.combineAllergies();
          const allergiesText = this.formatArrayField(allAllergies);
          if (allergiesText !== this.patientData?.allergies) {
            await this.patientService.updatePatient(patientId, { allergies: allergiesText });
          }
        } else {
          const allAllergies = this.combineAllergies();
          const allergiesText = this.formatArrayField(allAllergies);
          if (allergiesText && allergiesText !== this.patientData?.allergies) {
            await this.patientService.updatePatient(patientId, { allergies: allergiesText });
          }
        }
      } else {
        // New patient: create
        const patientData: any = {
          name: `${this.firstName.trim()} ${this.lastName.trim()}`,
          phone: this.phone.trim()
        };
        if (this.email.trim()) patientData.email = this.email.trim();
        if (this.dateOfBirth)  patientData.dateOfBirth = new Date(this.dateOfBirth);
        if (this.gender)       patientData.gender = this.gender;
        const allergiesText = this.formatArrayField(this.allergies);
        if (allergiesText)     patientData.allergies = allergiesText;

        patientId = await this.patientService.createPatient(patientData);
      }

      // Visit data (if any)
      if (this.hasVisitData()) {
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
      }

      // Success - close form first, then show popup
      this.isSubmitting = false;
      
      // Emit so home.ts refreshes search results
      this.patientAdded.emit(patientId);
      
      // Close the form immediately
      this.onClose();

      // Show success popup AFTER form closes
      await Swal.fire({
        title: this.isNewVisit ? 'Visit Added!' : 'Patient Added Successfully!',
        text: this.isNewVisit ? 'The new visit has been recorded.' : 'The patient has been added to the system.',
        icon: 'success',
        confirmButtonText: 'OK',
        confirmButtonColor: '#6366f1',
        timer: 2000,
        timerProgressBar: true
      });

    } catch (error: any) {
      console.error('Error in onSubmit:', error);
      this.isSubmitting = false;
      
      const errorMessage = error?.message || 'An unexpected error occurred';
      this.errorMessage = this.isNewVisit 
        ? `Failed to save visit: ${errorMessage}`
        : `Failed to save patient: ${errorMessage}`;
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

    if (this.isNewVisit) {
      const hasPresentIllness = this.formatArrayField(this.presentIllnesses).length > 0;
      if (!hasPresentIllness) {
        this.errorMessage = 'Present illness is required for new visits';
        return false;
      }
    }

    return true;
  }

  private combineAllergies(): DynamicField[] {
    const combined = [...this.existingAllergies];
    const newWithContent = this.newAllergies.filter(a => a.description.trim().length > 0);
    combined.push(...newWithContent);
    return combined;
  }

  private hasVisitData(): boolean {
    const hasPresentIllness = this.formatArrayField(this.presentIllnesses).length > 0;
    
    if (this.isNewVisit && !hasPresentIllness) {
      return false;
    }
    
    const hasAnyData = (
      hasPresentIllness ||
      this.formatArrayField(this.chiefComplaints).length > 0 ||
      this.diagnosis.length > 0 ||
      this.formatExaminations().length > 0 ||
      this.formatMedicines().length > 0 ||
      this.treatmentPlan.trim().length > 0 ||
      this.advice.trim().length > 0
    );
    
    return hasAnyData;
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
    if (!this.isNewVisit) return false;
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