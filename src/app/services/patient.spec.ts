import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientService } from './patient';
import { PatientSearchService } from './patientSearchService';
import { AuthenticationService } from './authenticationService';
import { FirebaseService } from './firebase';
import { ClinicContextService } from './clinicContextService';
import { Patient } from '../models/patient.model';

describe('PatientService (Orchestrator)', () => {
  let service: PatientService;
  let searchService: any;
  let firebaseService: any;
  let authService: any;
  let clinicContextService: any;

  const mockPatient: Patient = {
    id: 'pat-123',
    subscription_id: 'sub_01',
    name: 'John Doe',
    phone: '5551234567',
    email: 'john@example.com',
    clinic_ids: ['clinic_01'],
    ailments: 'old ailments',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z'
  };

  beforeEach(() => {
    searchService = {
      searchResults$: { subscribe: vi.fn() },
      hasMoreResults: false,
      isLoadingMore: false,
      search: vi.fn().mockResolvedValue(undefined),
      loadMore: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn()
    };

    firebaseService = {
      getPatientById: vi.fn().mockResolvedValue(mockPatient),
      addPatient: vi.fn().mockResolvedValue('pat-new'),
      updatePatient: vi.fn().mockResolvedValue(undefined),
      deletePatient: vi.fn().mockResolvedValue(undefined),
      addVisit: vi.fn().mockResolvedValue('visit-123'),
      getPatientVisits: vi.fn().mockResolvedValue([]),
      deleteVisit: vi.fn().mockResolvedValue(undefined),
      searchPatientByPhone: vi.fn().mockResolvedValue({ results: [] }),
      searchPatientsContaining: vi.fn().mockResolvedValue({ results: [] }),
    };

    authService = {
      currentUser$: { subscribe: vi.fn() },
      getCurrentUserId: vi.fn(() => 'user-001')
    };

    clinicContextService = {
      getSelectedClinicId: vi.fn(() => 'clinic_01'),
      getSubscriptionId: vi.fn(() => 'sub_01'),
      requireSubscriptionId: vi.fn(() => 'sub_01'),
    };

    TestBed.configureTestingModule({
      providers: [
        PatientService,
        { provide: PatientSearchService, useValue: searchService },
        { provide: FirebaseService, useValue: firebaseService },
        { provide: AuthenticationService, useValue: authService },
        { provide: ClinicContextService, useValue: clinicContextService }
      ]
    });

    service = TestBed.inject(PatientService);
  });

  // ──── SEARCH & PAGINATION ────
  describe('Search & Pagination', () => {
    it('should search patients via PatientSearchService', async () => {
      await service.searchPatients('john');
      expect(searchService.search).toHaveBeenCalledWith('john');
    });

    it('should load more patients via PatientSearchService', async () => {
      await service.loadMorePatients();
      expect(searchService.loadMore).toHaveBeenCalled();
    });

    it('should clear search results via PatientSearchService', () => {
      service.clearSearchResults();
      expect(searchService.clear).toHaveBeenCalled();
    });

    it('should expose hasMoreResults from PatientSearchService', () => {
      searchService.hasMoreResults = true;
      expect(service.hasMoreResults).toBe(true);
    });
  });

  // ──── CRUD OPERATIONS ────
  describe('CRUD Operations', () => {
    it('should fetch patient by ID', async () => {
      const result = await service.getPatient('pat-123');
      expect(firebaseService.getPatientById).toHaveBeenCalledWith('pat-123');
      expect(result).toEqual(mockPatient);
    });

    it('should create new patient when no existing match', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({ results: [] });

      const patientData = {
        subscription_id: 'sub_01',
        name: 'Jane Doe',
        phone: '5559876543',
        email: 'jane@example.com',
        clinic_ids: ['clinic_01']
      } as Omit<Patient, 'id' | 'last_updated'>;

      const id = await service.createPatient(patientData);
      expect(firebaseService.addPatient).toHaveBeenCalled();
      expect(id).toBe('pat-new');
    });

    it('should update existing patient when match found via createPatient', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({
        results: [{ ...mockPatient, name: 'John Doe', phone: '5551234567' }]
      });

      const id = await service.createPatient({
        subscription_id: 'sub_01',
        name: 'John Doe',
        phone: '5551234567',
        email: 'john@example.com',
        ailments: 'cough, fever',
        clinic_ids: ['clinic_01'],
      });

      expect(id).toBe('pat-123');
      expect(firebaseService.updatePatient).toHaveBeenCalledWith(
        'pat-123',
        expect.objectContaining({ ailments: 'cough, fever' })
      );
    });

    it('should update existing patient', async () => {
      const updateData = { name: 'John Updated' };
      await service.updatePatient('pat-123', updateData);
      expect(firebaseService.updatePatient).toHaveBeenCalledWith('pat-123', updateData);
    });

    it('should delete patient', async () => {
      await service.deletePatient('pat-123');
      expect(firebaseService.deletePatient).toHaveBeenCalledWith('pat-123');
    });

    it('should select and expose patient via selectedPatient$', () => {
      service.selectPatient(mockPatient);
      expect(service.selectedPatient$).toBeDefined();
    });
  });

  // ──── VISIT MANAGEMENT ────
  describe('Visit Management', () => {
    it('should add visit for patient', async () => {
      const visitData = {
        subscription_id: 'sub_01',
        clinic_id: 'clinic_01',
        doctor_id: 'doc_01',
        patient_id: 'pat-123',
        visit_datetime: new Date().toISOString(),
        clinical_data: { chief_complaints: ['Headache'], diagnosis: ['Migraine'], advice: 'Rest' },
        tests: [],
        medications: [],
        snapshot: { patient_name: 'John Doe', doctor_name: 'Dr Smith', clinic_name: 'City Clinic' },
        audit: { created_by: 'doc_01', updated_by: 'doc_01' },
        status: 'completed' as const,
        version: 1,
      };

      const visitId = await service.addVisit('pat-123', visitData);
      expect(firebaseService.addVisit).toHaveBeenCalledWith(visitData);
      expect(visitId).toBe('visit-123');
    });

    it('should fetch patient visits', async () => {
      await service.getPatientVisits('pat-123');
      expect(firebaseService.getPatientVisits).toHaveBeenCalledWith('pat-123');
    });

    it('should delete visit', async () => {
      await service.deleteVisit('pat-123', 'visit-456');
      expect(firebaseService.deleteVisit).toHaveBeenCalledWith('visit-456');
    });
  });

  // ──── VALIDATION ────
  describe('Validation', () => {
    it('should validate phone number', () => {
      expect(service.isValidPhone('5551234567')).toBe(true);
      expect(service.isValidPhone('not-a-phone')).toBe(false);
    });

    it('should validate email', () => {
      expect(service.isValidEmail('test@example.com')).toBe(true);
      expect(service.isValidEmail('invalid')).toBe(false);
    });

    it('should validate patient data comprehensively', () => {
      const result = service.validatePatientData({
        name: 'John Doe',
        phone: '5551234567',
        email: 'john@example.com'
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should report validation errors', () => {
      const result = service.validatePatientData({
        name: '',
        phone: '123',
        email: 'invalid'
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ──── EXISTENCE CHECKS ────
  describe('Existence Checks', () => {
    it('should check patient existence by name+phone', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({ results: [] });
      const exists = await service.checkPatientExists('John Doe', '5551234567');
      expect(exists).toBe(false);
    });

    it('should find existing patient by phone', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({
        results: [mockPatient]
      });
      const found = await service.findPatientByPhone('5551234567');
      expect(found).toEqual(mockPatient);
    });

    it('should return null when no patient found by phone', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({ results: [] });
      firebaseService.searchPatientsContaining.mockResolvedValue({ results: [] });
      const found = await service.findPatientByPhone('0000000000');
      expect(found).toBeNull();
    });
  });

  // ──── BACKWARD COMPATIBILITY ────
  describe('Backward Compatibility', () => {
    it('should expose all required public methods', () => {
      const methods = [
        'searchPatients',
        'loadMorePatients',
        'clearSearchResults',
        'getPatient',
        'createPatient',
        'updatePatient',
        'deletePatient',
        'selectPatient',
        'addVisit',
        'getPatientVisits',
        'deleteVisit',
        'isValidPhone',
        'isValidEmail',
        'validatePatientData',
        'checkPatientExists',
        'findPatientByPhone'
      ];

      methods.forEach(method => {
        expect(typeof service[method as keyof PatientService]).toBe('function');
      });
    });

    it('should expose all required observables', () => {
      expect(service.searchResults$).toBeDefined();
      expect(service.selectedPatient$).toBeDefined();
    });
  });

  // ──── ERROR HANDLING ────
  describe('Error Handling', () => {
    it('should handle getPatient errors gracefully', async () => {
      firebaseService.getPatientById.mockRejectedValue(new Error('Fetch failed'));
      await expect(service.getPatient('pat-123')).rejects.toThrow('Fetch failed');
    });

    it('should handle createPatient errors', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({ results: [] });
      firebaseService.addPatient.mockRejectedValue(new Error('Create failed'));

      await expect(
        service.createPatient({
          subscription_id: 'sub_01',
          name: 'Test',
          phone: '1234567890',
          clinic_ids: [],
        })
      ).rejects.toThrow('Create failed');
    });

    it('should return empty array when getPatientVisits fails', async () => {
      firebaseService.getPatientVisits.mockRejectedValue(new Error('Fetch failed'));
      const visits = await service.getPatientVisits('pat-123');
      expect(visits).toEqual([]);
    });
  });
});
