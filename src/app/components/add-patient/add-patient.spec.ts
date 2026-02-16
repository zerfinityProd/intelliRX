import { describe, it, expect, vi, beforeEach } from 'vitest';

function createAddPatientComponent(patientService: any, ngZone: any) {
  const component = {
    patientData: null as any,
    isEditMode: false,
    
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    gender: '',
    dateOfBirth: '',
    
    presentIllnesses: [{ description: '' }],
    allergies: [{ description: '' }],
    chiefComplaints: [{ description: '' }],
    diagnosis: '',
    treatmentPlan: '',
    advice: '',
    
    errorMessage: '',
    successMessage: '',
    isSubmitting: false,
    isNewVisit: false,
    
    existingAllergies: [] as any[],
    newAllergies: [{ description: '' }],
    
    close: { emit: vi.fn() },
    patientAdded: { emit: vi.fn() },
    toggleEdit: { emit: vi.fn() },

    ngOnInit() {
      this.initializeForm();
    },

    ngOnChanges(changes: any) {
      if (changes.patientData && this.patientData) {
        this.initializeForm();
      }
    },

    initializeForm() {
      if (this.patientData) {
        this.isNewVisit = true;
        const nameParts = this.patientData.name.trim().split(' ');
        this.firstName = nameParts[0] || '';
        this.lastName = nameParts.slice(1).join(' ') || '';
        this.phone = this.patientData.phone || '';
        this.email = this.patientData.email || '';
        this.gender = this.patientData.gender || '';
        
        if (this.patientData.allergies) {
          this.existingAllergies = this.patientData.allergies.map((a: any) => ({ description: a }));
        }
      }
    },

    addAllergy() {
      if (this.isNewVisit) {
        if (this.isEditMode) {
          this.existingAllergies.push({ description: '' });
        } else {
          this.newAllergies.push({ description: '' });
        }
      } else {
        this.allergies.push({ description: '' });
      }
    },

    removeAllergy(index: number) {
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
    },

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
      if (!patientService.isValidPhone(this.phone)) {
        this.errorMessage = 'Invalid phone number';
        return false;
      }
      return true;
    },

    async onSubmit() {
      if (!this.validateForm()) {
        return;
      }

      this.isSubmitting = true;
      this.errorMessage = '';

      try {
        if (this.isNewVisit && this.patientData) {
          const visitData = {
            presentIllnesses: this.presentIllnesses.map(p => p.description).filter(Boolean),
            chiefComplaints: this.chiefComplaints.map(c => c.description).filter(Boolean),
            diagnosis: this.diagnosis,
            treatmentPlan: this.treatmentPlan,
            advice: this.advice,
          };
          
          await patientService.addVisit(this.patientData.uniqueId, visitData);
          this.patientAdded.emit(this.patientData.uniqueId);
        } else {
          const patientData = {
            name: `${this.firstName.trim()} ${this.lastName.trim()}`,
            phone: this.phone.trim(),
            email: this.email.trim(),
            gender: this.gender,
          };
          
          const patientId = await patientService.createPatient(patientData);
          this.patientAdded.emit(patientId);
        }
        
        this.successMessage = 'Success!';
      } catch (error: any) {
        this.errorMessage = error.message || 'An error occurred';
      } finally {
        this.isSubmitting = false;
      }
    },

    clearSuccessMessage() {
      this.successMessage = '';
    },

    onClose() {
      this.close.emit();
    },

    onToggleEdit() {
      this.toggleEdit.emit();
    }
  };

  return component;
}

function makeComponent() {
  const patientServiceMock = {
    createPatient: vi.fn().mockResolvedValue('new-patient-id'),
    updatePatient: vi.fn().mockResolvedValue(undefined),
    addVisit: vi.fn().mockResolvedValue('visit-id'),
    isValidPhone: vi.fn().mockReturnValue(true),
    isValidEmail: vi.fn().mockReturnValue(true),
  };
  const ngZoneMock = { run: (fn: any) => fn() };
  const comp = createAddPatientComponent(patientServiceMock, ngZoneMock);
  return { comp, patientServiceMock };
}

function makePatient(overrides: any = {}) {
  return {
    uniqueId: 'doe_john_1234567890_user1',
    userId: 'user1',
    familyId: 'doe_john',
    name: 'John Doe',
    phone: '1234567890',
    email: 'john@example.com',
    gender: 'male',
    allergies: ['Peanuts'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('AddPatientComponent', () => {
  let comp: any;
  let patientServiceMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ comp, patientServiceMock } = makeComponent());
  });

  describe('Initial state', () => {
    it('starts with empty firstName', () => {
      expect(comp.firstName).toBe('');
    });

    it('starts with isNewVisit = false', () => {
      expect(comp.isNewVisit).toBe(false);
    });

    it('starts with one empty allergy field', () => {
      expect(comp.allergies).toHaveLength(1);
    });
  });

  describe('Dynamic field manipulation', () => {
    it('addAllergy adds to allergies[] in non-new visit', () => {
      comp.isNewVisit = false;
      comp.addAllergy();
      expect(comp.allergies).toHaveLength(2);
    });

    it('addAllergy adds to newAllergies[] in new-visit mode', () => {
      comp.isNewVisit = true;
      comp.isEditMode = false;
      comp.addAllergy();
      expect(comp.newAllergies).toHaveLength(2);
    });

    it('addAllergy adds to existingAllergies[] in edit mode', () => {
      comp.isNewVisit = true;
      comp.isEditMode = true;
      comp.existingAllergies = [{ description: 'Peanuts' }];
      comp.addAllergy();
      expect(comp.existingAllergies).toHaveLength(2);
    });
  });

  describe('validateForm', () => {
    beforeEach(() => {
      comp.firstName = 'John';
      comp.lastName = 'Doe';
      comp.phone = '1234567890';
    });

    it('returns true when all required fields are filled', () => {
      expect(comp.validateForm()).toBe(true);
    });

    it('returns false when firstName is empty', () => {
      comp.firstName = '';
      expect(comp.validateForm()).toBe(false);
      expect(comp.errorMessage).toBe('First name is required');
    });
  });

  describe('onSubmit — new patient', () => {
    beforeEach(() => {
      comp.firstName = 'Jane';
      comp.lastName = 'Smith';
      comp.phone = '9876543210';
      comp.isNewVisit = false;
    });

    it('calls createPatient with correct data', async () => {
      await comp.onSubmit();
      expect(patientServiceMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Smith',
          phone: '9876543210'
        })
      );
    });

    it('emits patientAdded with returned id', async () => {
      await comp.onSubmit();
      expect(comp.patientAdded.emit).toHaveBeenCalledWith('new-patient-id');
    });
  });

  describe('onSubmit — new visit for existing patient', () => {
    beforeEach(() => {
      comp.patientData = makePatient();
      comp.ngOnChanges({ patientData: { currentValue: comp.patientData } });
      comp.presentIllnesses = [{ description: 'Fever' }];
      comp.chiefComplaints = [{ description: 'Headache' }];
      comp.diagnosis = 'Flu';
      comp.treatmentPlan = 'Rest';
      comp.advice = 'Drink fluids';
    });

    it('calls addVisit instead of createPatient', async () => {
      await comp.onSubmit();
      expect(patientServiceMock.createPatient).not.toHaveBeenCalled();
      expect(patientServiceMock.addVisit).toHaveBeenCalledOnce();
    });
  });
});