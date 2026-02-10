import { Component, EventEmitter, Output, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';

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

// ✅ NEW: Interface to capture form data before reset
interface SaveData {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  presentIllnesses: DynamicField[];
  allergies: DynamicField[];
  existingAllergies: DynamicField[];
  newAllergies: DynamicField[];
  chiefComplaints: DynamicField[];
  diagnosis: string;
  examinations: Examination[];
  medicines: Medicine[];
  treatmentPlan: string;
  advice: string;
  isNewVisit: boolean;
  isEditMode: boolean;
  patientUniqueId?: string;
  originalAllergies?: string;
}

@Component({
  selector: 'app-add-patient',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-patient.html',
  styleUrl: './add-patient.css'
})
export class AddPatientComponent implements OnInit, OnChanges {
  // INPUT properties - MUST come first
  @Input() patientData: Patient | null = null;
  @Input() isEditMode: boolean = false;
  
  // OUTPUT properties
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
  isSubmitting: boolean = false;

  // NEW: Track if this is a new visit (vs new patient)
  isNewVisit: boolean = false;
  
  // NEW: Separate existing allergies from new ones
  existingAllergies: DynamicField[] = [];
  newAllergies: DynamicField[] = [{ description: '' }];

  constructor(private patientService: PatientService) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patientData'] && this.patientData) {
      this.initializeForm();
    }
  }

  /**
   * Initialize form with patient data if provided
   */
  private initializeForm(): void {
    if (this.patientData) {
      this.isNewVisit = true;
      
      // Split name into first and last
      const nameParts = this.patientData.name.trim().split(' ');
      this.firstName = nameParts[0] || '';
      this.lastName = nameParts.slice(1).join(' ') || '';
      
      this.phone = this.patientData.phone || '';
      this.email = this.patientData.email || '';
      this.gender = this.patientData.gender || '';
      this.familyId = this.patientData.familyId || '';
      
      // Format date for input
      if (this.patientData.dateOfBirth) {
        const dob = this.patientData.dateOfBirth;
        let dateObj: Date;
        
        if (typeof dob === 'object' && 'toDate' in dob) {
          dateObj = (dob as any).toDate();
        } else {
          dateObj = new Date(dob);
        }
        
        this.dateOfBirth = dateObj.toISOString().split('T')[0];
      }
      
      // Load existing allergies
      if (this.patientData.allergies) {
        const allergyList = this.patientData.allergies.split(',').map(a => a.trim()).filter(a => a);
        this.existingAllergies = allergyList.map(a => ({ description: a }));
        this.allergies = allergyList.map(a => ({ description: a }));
        if (this.allergies.length === 0) {
          this.allergies = [{ description: '' }];
        }
      } else {
        this.existingAllergies = [];
      }
      
      // Always start with empty new allergies field
      this.newAllergies = [{ description: '' }];
      
      // Present illness is now visit-specific, so always start fresh
      this.presentIllnesses = [{ description: '' }];
    }
  }

  /**
   * Check if a field should be readonly
   */
  isFieldReadonly(fieldName: string): boolean {
    if (!this.isNewVisit) return false; // New patient - all fields editable
    
    // For existing patient, check edit mode
    const lockedFields = ['firstName', 'lastName', 'phone', 'email', 'gender', 'dateOfBirth'];
    return lockedFields.includes(fieldName) && !this.isEditMode;
  }

  /**
   * Handle edit button click
   */
  onEditClick(): void {
    this.toggleEdit.emit();
  }

  onNameChange(): void {
    this.clearSuccessMessage();
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
    if (this.isNewVisit) {
      // In edit mode, add to existing allergies array
      if (this.isEditMode) {
        this.existingAllergies.push({ description: '' });
      } else {
        // Not in edit mode, add to new allergies
        this.newAllergies.push({ description: '' });
      }
    } else {
      // New patient - use regular allergies array
      this.allergies.push({ description: '' });
    }
  }

  removeAllergy(index: number): void {
    if (this.isNewVisit) {
      // In edit mode, remove from existing allergies
      if (this.isEditMode) {
        if (this.existingAllergies.length > 1) {
          this.existingAllergies.splice(index, 1);
        }
      } else {
        // Not in edit mode, remove from new allergies
        if (this.newAllergies.length > 1) {
          this.newAllergies.splice(index, 1);
        }
      }
    } else {
      // New patient - use regular allergies array
      if (this.allergies.length > 1) {
        this.allergies.splice(index, 1);
      }
    }
  }
  
  // Remove from existing allergies (for edit mode)
  removeExistingAllergy(index: number): void {
    if (this.existingAllergies.length > 1) {
      this.existingAllergies.splice(index, 1);
    }
  }
  
  // Remove from new allergies
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

    // ✅ CAPTURE ALL FORM DATA BEFORE RESETTING (Deep copy to prevent reference issues)
    const saveData: SaveData = {
      fullName: `${this.firstName.trim()} ${this.lastName.trim()}`,
      phone: this.phone.trim(),
      email: this.email.trim(),
      dateOfBirth: this.dateOfBirth,
      gender: this.gender,
      presentIllnesses: JSON.parse(JSON.stringify(this.presentIllnesses)),
      allergies: JSON.parse(JSON.stringify(this.allergies)),
      existingAllergies: JSON.parse(JSON.stringify(this.existingAllergies)),
      newAllergies: JSON.parse(JSON.stringify(this.newAllergies)),
      chiefComplaints: JSON.parse(JSON.stringify(this.chiefComplaints)),
      diagnosis: this.diagnosis.trim(),
      examinations: JSON.parse(JSON.stringify(this.examinations)),
      medicines: JSON.parse(JSON.stringify(this.medicines)),
      treatmentPlan: this.treatmentPlan.trim(),
      advice: this.advice.trim(),
      isNewVisit: this.isNewVisit,
      isEditMode: this.isEditMode,
      patientUniqueId: this.patientData?.uniqueId,
      originalAllergies: this.patientData?.allergies
    };

    console.log('📋 Captured form data:', saveData);

    // ⚡ INSTANT FEEDBACK - Show saving state immediately
    this.isSubmitting = true;

    // ⚡ OPTIMISTIC UI - Show success immediately
    setTimeout(() => {
      this.isSubmitting = false;
      this.successMessage = saveData.isNewVisit ? 'Visit saved successfully!' : 'Patient saved successfully!';
      
      // Reset form for next entry
      if (saveData.isNewVisit) {
        this.resetVisitFields();
      } else {
        this.resetForm();
      }
      
      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    }, 100);

    // 🔥 BACKGROUND SAVE - Do actual Firebase save in background with captured data
    this.performBackgroundSave(saveData);
  }

  /**
   * ⚡ OPTIMISTIC SAVE - Perform the actual save in background using captured data
   */
  private async performBackgroundSave(saveData: SaveData): Promise<void> {
    try {
      let patientId: string;
      
      if (saveData.isNewVisit && saveData.patientUniqueId) {
        // Updating existing patient + adding visit
        patientId = saveData.patientUniqueId;
        
        // Update patient data if edit mode was used
        if (saveData.isEditMode) {
          const updatedPatientData: any = {
            name: saveData.fullName,
            email: saveData.email || undefined,
            gender: saveData.gender || undefined,
          };
          
          if (saveData.dateOfBirth) {
            updatedPatientData.dateOfBirth = new Date(saveData.dateOfBirth);
          }
          
          // In edit mode, use existing allergies array (which is now editable)
          const allergiesText = this.formatArrayField(saveData.existingAllergies);
          if (allergiesText) {
            updatedPatientData.allergies = allergiesText;
          }
          
          await this.patientService.updatePatient(patientId, updatedPatientData);
        } else {
          // Not in edit mode, combine existing and new allergies
          const allAllergies = this.combineAllergiesFromData(saveData);
          const allergiesText = this.formatArrayField(allAllergies);
          if (allergiesText !== saveData.originalAllergies) {
            await this.patientService.updatePatient(patientId, { allergies: allergiesText });
          }
        }
      } else {
        // ✅ Creating new patient
        const patientData: any = {
          name: saveData.fullName,
          phone: saveData.phone
        };

        if (saveData.email) patientData.email = saveData.email;
        if (saveData.dateOfBirth) patientData.dateOfBirth = new Date(saveData.dateOfBirth);
        if (saveData.gender) patientData.gender = saveData.gender;

        const allergiesText = this.formatArrayField(saveData.allergies);
        if (allergiesText) patientData.allergies = allergiesText;

        console.log('🔥 Creating patient with data:', patientData);
        patientId = await this.patientService.createPatient(patientData);
        console.log('✅ Patient created with ID:', patientId);
      }

      // ✅ Add visit if medical data is provided (works for BOTH new patients AND new visits)
      if (this.hasVisitDataFromSaveData(saveData)) {
        const visitData: any = {
          chiefComplaints: this.formatArrayField(saveData.chiefComplaints),
          diagnosis: saveData.diagnosis,
          examination: this.formatExaminationsFromData(saveData.examinations),
          treatmentPlan: saveData.treatmentPlan,
          advice: saveData.advice
        };

        const presentIllnessText = this.formatArrayField(saveData.presentIllnesses);
        if (presentIllnessText) {
          visitData.presentIllness = presentIllnessText;
        }

        const medicinesText = this.formatMedicinesFromData(saveData.medicines);
        if (medicinesText) {
          visitData.medicines = medicinesText;
        }

        console.log('🔥 Creating visit with data:', visitData);
        await this.patientService.addVisit(patientId, visitData);
        console.log('✅ Visit created successfully');
      } else {
        console.log('ℹ️ No visit data to save');
      }

      // ✅ Emit success event after actual save
      this.patientAdded.emit(patientId);
      
      console.log('✅ Background save completed successfully');
    } catch (error) {
      // ❌ Only show error if background save fails
      console.error('❌ Background save failed:', error);
      this.errorMessage = saveData.isNewVisit ? 'Failed to save visit. Data may not be saved.' : 'Failed to save patient. Data may not be saved.';
      this.isSubmitting = false;
      
      // Clear error after 5 seconds
      setTimeout(() => {
        this.errorMessage = '';
      }, 5000);
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

    // Validate present illness for new visits
    if (this.isNewVisit) {
      const hasPresentIllness = this.formatArrayField(this.presentIllnesses).length > 0;
      if (!hasPresentIllness) {
        this.errorMessage = 'Present illness is required for new visits';
        return false;
      }
    }

    return true;
  }

  /**
   * Combine allergies from saved data
   */
  private combineAllergiesFromData(saveData: SaveData): DynamicField[] {
    const combined = [...saveData.existingAllergies];
    const newWithContent = saveData.newAllergies.filter(a => a.description.trim().length > 0);
    combined.push(...newWithContent);
    return combined;
  }

  /**
   * Check if there's visit data in saved data
   */
  private hasVisitDataFromSaveData(saveData: SaveData): boolean {
    const hasPresentIllness = this.formatArrayField(saveData.presentIllnesses).length > 0;
    
    // For new visits, present illness is REQUIRED
    if (saveData.isNewVisit && !hasPresentIllness) {
      return false;
    }
    
    // For new patients, at least one field should have data
    const hasAnyData = (
      hasPresentIllness ||
      this.formatArrayField(saveData.chiefComplaints).length > 0 ||
      saveData.diagnosis.length > 0 ||
      this.formatExaminationsFromData(saveData.examinations).length > 0 ||
      this.formatMedicinesFromData(saveData.medicines).length > 0 ||
      saveData.treatmentPlan.length > 0 ||
      saveData.advice.length > 0
    );

    console.log('🔍 hasVisitDataFromSaveData:', hasAnyData, {
      hasPresentIllness,
      chiefComplaints: this.formatArrayField(saveData.chiefComplaints),
      diagnosis: saveData.diagnosis,
      examinations: this.formatExaminationsFromData(saveData.examinations),
      medicines: this.formatMedicinesFromData(saveData.medicines),
      treatmentPlan: saveData.treatmentPlan,
      advice: saveData.advice
    });

    return hasAnyData;
  }

  /**
   * Combine existing allergies with new ones (only when NOT in edit mode)
   */
  combineAllergies(): DynamicField[] {
    const combined = [...this.existingAllergies];
    
    // Add new allergies that have content
    const newWithContent = this.newAllergies.filter(a => a.description.trim().length > 0);
    combined.push(...newWithContent);
    
    return combined;
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

  private formatExaminationsFromData(examinations: Examination[]): string {
    return examinations
      .filter(exam => exam.testName.trim() && exam.result.trim())
      .map(exam => `${exam.testName.trim()}: ${exam.result.trim()}`)
      .join(', ');
  }

  formatMedicines(): string {
    return this.medicines
      .filter(med => med.name.trim())
      .map(med => {
        const parts = [med.name.trim()];
        if (med.dosage.trim()) parts.push(med.dosage.trim());
        if (med.frequency.trim()) parts.push(med.frequency.trim());
        return parts.join(' - ');
      })
      .join(', ');
  }

  private formatMedicinesFromData(medicines: Medicine[]): string {
    return medicines
      .filter(med => med.name.trim())
      .map(med => {
        const parts = [med.name.trim()];
        if (med.dosage.trim()) parts.push(med.dosage.trim());
        if (med.frequency.trim()) parts.push(med.frequency.trim());
        return parts.join(' - ');
      })
      .join(', ');
  }

  hasVisitData(): boolean {
    const hasPresentIllness = this.formatArrayField(this.presentIllnesses).length > 0;
    
    // For new visits, present illness is REQUIRED
    if (this.isNewVisit && !hasPresentIllness) {
      return false;
    }
    
    // For new patients, at least one field should have data
    return (
      hasPresentIllness ||
      this.formatArrayField(this.chiefComplaints).length > 0 ||
      this.diagnosis.trim().length > 0 ||
      this.formatExaminations().length > 0 ||
      this.formatMedicines().length > 0 ||
      this.treatmentPlan.trim().length > 0 ||
      this.advice.trim().length > 0
    );
  }

  /**
   * Reset only visit-specific fields (for new visit form)
   */
  resetVisitFields(): void {
    this.presentIllnesses = [{ description: '' }];
    this.newAllergies = [{ description: '' }];
    this.chiefComplaints = [{ description: '' }];
    this.diagnosis = '';
    this.examinations = [{ testName: '', result: '' }];
    this.medicines = [{ name: '', dosage: '', frequency: '' }];
    this.treatmentPlan = '';
    this.advice = '';
    this.errorMessage = '';
  }

  /**
   * Reset entire form (for new patient)
   */
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
    this.existingAllergies = [];
    this.newAllergies = [{ description: '' }];
    this.chiefComplaints = [{ description: '' }];
    this.diagnosis = '';
    this.examinations = [{ testName: '', result: '' }];
    this.medicines = [{ name: '', dosage: '', frequency: '' }];
    this.treatmentPlan = '';
    this.advice = '';
    this.errorMessage = '';
  }

  onClose(): void {
    this.close.emit();
  }
}