import { describe, it, expect, vi, beforeEach } from 'vitest';

function createEditPatientInfoComponent(patientService: any, ngZone: any) {
  const component = {
    patientData: null as any,
    
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    gender: '',
    dateOfBirth: '',
    
    errorMessage: '',
    successMessage: '',
    isSubmitting: false,
    
    close: { emit: vi.fn() },
    patientUpdated: { emit: vi.fn() },

    ngOnChanges(changes: any) {
      if (changes.patientData && this.patientData) {
        const nameParts = this.patientData.name.trim().split(' ');
        this.firstName = nameParts[0] || '';
        this.lastName = nameParts.slice(1).join(' ') || '';
        this.phone = this.patientData.phone || '';
        this.email = this.patientData.email || '';
        this.gender = this.patientData.gender || '';
        this.dateOfBirth = this.patientData.dateOfBirth || '';
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
        const updatedData = {
          name: `${this.firstName.trim()} ${this.lastName.trim()}`,
          phone: this.phone.trim(),
          email: this.email.trim(),
          gender: this.gender,
          dateOfBirth: this.dateOfBirth,
        };
        
        await patientService.updatePatient(this.patientData.uniqueId, updatedData);
        this.successMessage = 'Patient updated successfully!';
        this.patientUpdated.emit();
      } catch (error: any) {
        this.errorMessage = error.message || 'Failed to update patient';
      } finally {
        this.isSubmitting = false;
      }
    },

    onClose() {
      this.close.emit();
    }
  };

  return component;
}

function makeComponent() {
  const patientServiceMock = {
    updatePatient: vi.fn().mockResolvedValue(undefined),
    isValidPhone: vi.fn().mockReturnValue(true),
    isValidEmail: vi.fn().mockReturnValue(true),
  };
  const ngZoneMock = { run: (fn: any) => fn() };
  const comp = createEditPatientInfoComponent(patientServiceMock, ngZoneMock);
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
    dateOfBirth: '1990-01-01',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('EditPatientInfoComponent', () => {
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

    it('starts with empty phone', () => {
      expect(comp.phone).toBe('');
    });
  });

  describe('ngOnChanges with patientData', () => {
    it('populates form fields from patientData', () => {
      const patient = makePatient();
      comp.patientData = patient;
      comp.ngOnChanges({ patientData: { currentValue: patient } });

      expect(comp.firstName).toBe('John');
      expect(comp.lastName).toBe('Doe');
      expect(comp.phone).toBe('1234567890');
    });
  });

  describe('onSubmit', () => {
    beforeEach(() => {
      comp.patientData = makePatient();
      comp.firstName = 'Jane';
      comp.lastName = 'Smith';
      comp.phone = '9876543210';
    });

    it('calls updatePatient with correct data', async () => {
      await comp.onSubmit();
      expect(patientServiceMock.updatePatient).toHaveBeenCalledWith(
        'doe_john_1234567890_user1',
        expect.objectContaining({
          name: 'Jane Smith',
          phone: '9876543210'
        })
      );
    });

    it('emits patientUpdated on success', async () => {
      await comp.onSubmit();
      expect(comp.patientUpdated.emit).toHaveBeenCalled();
    });
  });
});