import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientService } from './patient';
import { PatientSearchService } from './patientSearchService';
import { AuthenticationService } from './authenticationService';
import { FirebaseService } from './firebase';
import { Patient } from '../models/patient.model';

describe('PatientService (Merged & Orchestrator)', () => {
  let service: PatientService;
  let searchService: any;
  let firebaseService: any;
  let authService: any;

  const mockPatient: Patient = {
    uniqueId: 'pat-123',
    userId: 'user-001',
    name: 'John Doe',
    familyId: 'doe_john',
    phone: '5551234567',
    email: 'john@example.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
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
      searchPatientByFamilyId: vi.fn().mockResolvedValue({ results: [] }),
      generateFamilyId: vi.fn().mockReturnValue('doe_5551234567')
    };

    authService = {
      currentUser$: { subscribe: vi.fn() },
      getCurrentUserId: vi.fn(() => 'user-001')
    };

    TestBed.configureTestingModule({
      providers: [
        PatientService,
        { provide: PatientSearchService, useValue: searchService },
        { provide: FirebaseService, useValue: firebaseService },
        { provide: AuthenticationService, useValue: authService }
      ]
    });

    service = TestBed.inject(PatientService);
  });

  // ──── SEARCH & PAGINATION ────
  describe('Search & Pagination', () => {
    it('should search patients via PatientSearchService', async () => {
      await service.searchPatients('john');
      expect(searchService.search).toHaveBeenCalledWith('john', 'user-001');
    });

    it('should load more patients via PatientSearchService', async () => {
      await service.loadMorePatients();
      expect(searchService.loadMore).toHaveBeenCalledWith('user-001');
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

  // ──── CRUD OPERATIONS (merged from PatientCRUDService) ────
  describe('CRUD Operations (Merged from PatientCRUDService)', () => {
    it('should fetch patient by unique ID', async () => {
      const result = await service.getPatient('pat-123');
      expect(firebaseService.getPatientById).toHaveBeenCalledWith('pat-123', 'user-001');
      expect(result).toEqual(mockPatient);
    });

    it('should create new patient', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({ results: [] });

      const patientData = { name: 'Jane Doe', phone: '5559876543', email: 'jane@example.com', userId: 'user-001' };
      const id = await service.createPatient(patientData);

      expect(firebaseService.addPatient).toHaveBeenCalled();
      expect(id).toBe('pat-new');
    });

    it('should update existing patient', async () => {
      const updateData = { name: 'John Updated' };
      await service.updatePatient('pat-123', updateData);

      expect(firebaseService.updatePatient).toHaveBeenCalledWith('pat-123', updateData, 'user-001');
    });

    it('should delete patient', async () => {
      await service.deletePatient('pat-123');
      expect(firebaseService.deletePatient).toHaveBeenCalledWith('pat-123', 'user-001');
    });

    it('should select and expose patient via selectedPatient$', () => {
      service.selectPatient(mockPatient);
      expect(service.selectedPatient$).toBeDefined();
    });
  });

  // ──── VISIT MANAGEMENT (merged from PatientVisitService) ────
  describe('Visit Management (Merged from PatientVisitService)', () => {
    it('should add visit to patient', async () => {
      const visitData = {
        chiefComplaints: 'Headache',
        diagnosis: 'Migraine',
        examination: 'Normal',
        treatmentPlan: 'Rest',
        advice: 'Hydrate'
      };

      const visitId = await service.addVisit('pat-123', visitData);
      expect(firebaseService.addVisit).toHaveBeenCalledWith('pat-123', visitData, 'user-001');
      expect(visitId).toBe('visit-123');
    });

    it('should fetch patient visits', async () => {
      await service.getPatientVisits('pat-123');
      expect(firebaseService.getPatientVisits).toHaveBeenCalledWith('pat-123', 'user-001');
    });

    it('should delete visit from patient', async () => {
      await service.deleteVisit('pat-123', 'visit-456');
      expect(firebaseService.deleteVisit).toHaveBeenCalledWith('pat-123', 'visit-456', 'user-001');
    });
  });

  // ──── VALIDATION (merged from PatientValidationService) ────
  describe('Validation (Merged from PatientValidationService)', () => {
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

  // ──── EXISTENCE CHECKS (merged from PatientCRUDService) ────
  describe('Existence Checks', () => {
    it('should check if unique ID exists', async () => {
      firebaseService.searchPatientByPhone.mockResolvedValue({ results: [] });

      const exists = await service.checkUniqueIdExists('John Doe', '5551234567');
      expect(exists).toBe(false);
    });

    it('should check if family ID exists', async () => {
      firebaseService.searchPatientByFamilyId.mockResolvedValue({ results: [] });

      const exists = await service.checkFamilyIdExists('doe_5551234567');
      expect(exists).toBe(false);
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
        'checkUniqueIdExists',
        'checkFamilyIdExists'
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
      firebaseService.addPatient.mockRejectedValue(new Error('Create failed'));

      await expect(
        service.createPatient({ name: 'Test', phone: '1234567890', email: 'test@example.com' })
      ).rejects.toThrow('Create failed');
    });

    it('should return empty array when getPatientVisits fails', async () => {
      firebaseService.getPatientVisits.mockRejectedValue(new Error('Fetch failed'));

      const visits = await service.getPatientVisits('pat-123');
      expect(visits).toEqual([]);
    });
  });
});
