import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientService } from './patient';
import { PatientSearchService } from './patientSearchService';
import { PatientCRUDService } from './patientCRUDService';
import { PatientVisitService } from './patientVisitService';
import { PatientValidationService } from './patientValidationService';
import { AuthenticationService } from './authenticationService';
import { Patient } from '../models/patient.model';

describe('PatientService (Orchestrator)', () => {
  let service: PatientService;
  let searchService: any;
  let crudService: any;
  let visitService: any;
  let validationService: any;
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
      search: vi.fn(),
      loadMore: vi.fn(),
      clear: vi.fn()
    };

    crudService = {
      selectedPatient$: { subscribe: vi.fn() },
      getPatient: vi.fn(),
      createPatient: vi.fn(),
      updatePatient: vi.fn(),
      deletePatient: vi.fn(),
      selectPatient: vi.fn(),
      checkUniqueIdExists: vi.fn(),
      checkFamilyIdExists: vi.fn()
    };

    visitService = {
      addVisit: vi.fn(),
      getVisits: vi.fn(),
      deleteVisit: vi.fn()
    };

    validationService = {
      isValidPhone: vi.fn(),
      isValidEmail: vi.fn(),
      isValidName: vi.fn(),
      isValidDateOfBirth: vi.fn(),
      isValidGender: vi.fn(),
      validatePatientData: vi.fn()
    };

    authService = {
      currentUser$: { subscribe: vi.fn() }
    };

    TestBed.configureTestingModule({
      providers: [
        PatientService,
        { provide: PatientSearchService, useValue: searchService },
        { provide: PatientCRUDService, useValue: crudService },
        { provide: PatientVisitService, useValue: visitService },
        { provide: PatientValidationService, useValue: validationService },
        { provide: AuthenticationService, useValue: authService }
      ]
    });

    service = TestBed.inject(PatientService);
  });

  describe('Observable Proxying', () => {
    it('should proxy searchResults$ from PatientSearchService', () => {
      const results$ = service.searchResults$;
      expect(results$).toBeDefined();
    });

    it('should proxy selectedPatient$ from PatientCRUDService', () => {
      const selected$ = service.selectedPatient$;
      expect(selected$).toBeDefined();
    });

    it('should proxy loading states from PatientSearchService', () => {
      const hasMore = service.hasMoreResults;
      const isLoading = service.isLoadingMore;
      expect(typeof hasMore).toBe('boolean');
      expect(typeof isLoading).toBe('boolean');
    });
  });

  describe('Search Operations', () => {
    it('should delegate searchPatients to PatientSearchService', async () => {
      searchService.search.mockResolvedValue(undefined);

      await service.searchPatients('john');

      expect(searchService.search).toHaveBeenCalledWith('john', expect.any(String));
    });

    it('should delegate loadMorePatients to PatientSearchService', async () => {
      searchService.loadMore.mockResolvedValue(undefined);

      await service.loadMorePatients();

      expect(searchService.loadMore).toHaveBeenCalled();
    });

    it('should delegate clearSearchResults to PatientSearchService', () => {
      searchService.clear.mockReturnValue(undefined);

      service.clearSearchResults();

      expect(searchService.clear).toHaveBeenCalled();
    });
  });

  describe('CRUD Operations', () => {
    it('should delegate getPatient to PatientCRUDService', async () => {
      crudService.getPatient.mockResolvedValue(mockPatient);

      const result = await service.getPatient('pat-123');

      expect(crudService.getPatient).toHaveBeenCalledWith('pat-123', expect.any(String));
      expect(result).toEqual(mockPatient);
    });

    it('should delegate createPatient to PatientCRUDService', async () => {
      crudService.createPatient.mockResolvedValue('pat-new');

      const patientData = { name: 'Jane Doe', phone: '5559876543' };
      const result = await service.createPatient(patientData);

      expect(crudService.createPatient).toHaveBeenCalledWith(
        patientData,
        expect.any(String),
        expect.anything()
      );
      expect(result).toBe('pat-new');
    });

    it('should delegate updatePatient to PatientCRUDService', async () => {
      crudService.updatePatient.mockResolvedValue(undefined);

      const updates: Partial<Patient> = { email: 'newemail@example.com' };
      await service.updatePatient('pat-123', updates);

      expect(crudService.updatePatient).toHaveBeenCalledWith('pat-123', updates, expect.any(String));
    });

    it('should delegate deletePatient to PatientCRUDService', async () => {
      crudService.deletePatient.mockResolvedValue(undefined);

      await service.deletePatient('pat-123');

      expect(crudService.deletePatient).toHaveBeenCalledWith('pat-123', expect.any(String));
    });

    it('should delegate selectPatient to PatientCRUDService', () => {
      crudService.selectPatient.mockReturnValue(undefined);

      service.selectPatient(mockPatient);

      expect(crudService.selectPatient).toHaveBeenCalledWith(mockPatient);
    });

    it('should delegate selectPatient with null to PatientCRUDService', () => {
      crudService.selectPatient.mockReturnValue(undefined);

      service.selectPatient(null);

      expect(crudService.selectPatient).toHaveBeenCalledWith(null);
    });
  });

  describe('Visit Operations', () => {
    it('should delegate addVisit to PatientVisitService', async () => {
      visitService.addVisit.mockResolvedValue('visit-123');

      const visitData = {
        chiefComplaints: 'Headache',
        diagnosis: 'Migraine',
        examination: 'Normal neurological exam',
        treatmentPlan: 'Pain management',
        advice: 'Rest and hydration',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await service.addVisit('pat-123', visitData);

      expect(visitService.addVisit).toHaveBeenCalledWith('pat-123', visitData, expect.any(String));
      expect(result).toBe('visit-123');
    });

    it('should delegate getPatientVisits to PatientVisitService', async () => {
      const mockVisits = [{
        id: 'visit-1',
        chiefComplaints: 'Fever',
        diagnosis: 'Flu',
        examination: 'Normal',
        treatmentPlan: 'Rest',
        advice: 'Hydrate',
        createdAt: new Date(),
        updatedAt: new Date()
      }];
      visitService.getVisits.mockResolvedValue(mockVisits);

      const result = await service.getPatientVisits('pat-123');

      expect(visitService.getVisits).toHaveBeenCalledWith('pat-123', expect.any(String));
      expect(result).toEqual(mockVisits);
    });

    it('should delegate deleteVisit to PatientVisitService', async () => {
      visitService.deleteVisit.mockResolvedValue(undefined);

      await service.deleteVisit('pat-123', 'visit-123');

      expect(visitService.deleteVisit).toHaveBeenCalledWith('pat-123', 'visit-123', expect.any(String));
    });
  });

  describe('Validation Operations', () => {
    it('should delegate isValidPhone to PatientValidationService', () => {
      validationService.isValidPhone.mockReturnValue(true);

      const result = service.isValidPhone('5551234567');

      expect(validationService.isValidPhone).toHaveBeenCalledWith('5551234567');
      expect(result).toBe(true);
    });

    it('should delegate isValidEmail to PatientValidationService', () => {
      validationService.isValidEmail.mockReturnValue(true);

      const result = service.isValidEmail('test@example.com');

      expect(validationService.isValidEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toBe(true);
    });

    it('should delegate validatePatientData to PatientValidationService', () => {
      const validationResult = { valid: true, errors: [] };
      validationService.validatePatientData.mockReturnValue(validationResult);

      const result = service.validatePatientData(mockPatient);

      expect(validationService.validatePatientData).toHaveBeenCalledWith(mockPatient);
      expect(result).toEqual(validationResult);
    });
  });

  describe('Existence Checks', () => {
    it('should delegate checkUniqueIdExists to PatientCRUDService', async () => {
      crudService.checkUniqueIdExists.mockResolvedValue(true);

      const result = await service.checkUniqueIdExists('John Doe', '5551234567');

      expect(crudService.checkUniqueIdExists).toHaveBeenCalledWith(
        'John Doe',
        '5551234567',
        expect.any(String)
      );
      expect(result).toBe(true);
    });

    it('should delegate checkFamilyIdExists to PatientCRUDService', async () => {
      crudService.checkFamilyIdExists.mockResolvedValue(false);

      const result = await service.checkFamilyIdExists('doe_john');

      expect(crudService.checkFamilyIdExists).toHaveBeenCalledWith('doe_john', expect.any(String));
      expect(result).toBe(false);
    });
  });

  describe('Backward Compatibility', () => {
    it('should expose all public methods from original PatientService', () => {
      const expectedMethods = [
        'searchPatients',
        'loadMore',
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

      expectedMethods.forEach(method => {
        expect(service[method as keyof PatientService]).toBeDefined();
        expect(typeof service[method as keyof PatientService]).toBe('function');
      });
    });

    it('should expose all public observables from original PatientService', () => {
      const expectedObservables = [
        'searchResults$',
        'selectedPatient$'
      ];

      expectedObservables.forEach(observable => {
        expect(service[observable as keyof PatientService]).toBeDefined();
      });
    });
  });

  describe('Orchestration Scenarios', () => {
    it('should search and then select patient from results', async () => {
      searchService.search.mockResolvedValue(undefined);
      crudService.selectPatient.mockReturnValue(undefined);

      await service.searchPatients('john');
      service.selectPatient(mockPatient);

      expect(searchService.search).toHaveBeenCalled();
      expect(crudService.selectPatient).toHaveBeenCalledWith(mockPatient);
    });

    it('should validate patient data before creation', async () => {
      validationService.validatePatientData.mockReturnValue({ valid: true, errors: [] });
      crudService.createPatient.mockResolvedValue('pat-new');

      const patientData = mockPatient;
      const validation = service.validatePatientData(patientData);

      expect(validation.valid).toBe(true);

      if (validation.valid) {
        await service.createPatient(patientData);
        expect(crudService.createPatient).toHaveBeenCalled();
      }
    });

    it('should handle patient addition with visits', async () => {
      crudService.createPatient.mockResolvedValue('pat-new');
      visitService.addVisit.mockResolvedValue('visit-123');

      const patientData = { name: 'John Doe', phone: '5551234567' };
      await service.createPatient(patientData);

      const visitData = {
        chiefComplaints: 'Flu',
        diagnosis: 'Influenza',
        examination: 'Normal',
        treatmentPlan: 'Rest',
        advice: 'Hydrate',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await service.addVisit('pat-new', visitData);

      expect(crudService.createPatient).toHaveBeenCalled();
      expect(visitService.addVisit).toHaveBeenCalled();
    });

    it('should check existence before creating patient', async () => {
      crudService.checkUniqueIdExists.mockResolvedValue(true);
      crudService.createPatient.mockResolvedValue('pat-123');

      const exists = await service.checkUniqueIdExists('John Doe', '5551234567');

      if (exists) {
        // Patient already exists, fetch instead
        crudService.getPatient.mockResolvedValue(mockPatient);
        await service.getPatient('pat-123');
      }

      expect(crudService.checkUniqueIdExists).toHaveBeenCalled();
      expect(crudService.getPatient).toHaveBeenCalled();
    });
  });

  describe('Error Propagation', () => {
    it('should propagate search errors', async () => {
      searchService.search.mockRejectedValue(new Error('Search failed'));

      await expect(service.searchPatients('query')).rejects.toThrow('Search failed');
    });

    it('should propagate CRUD errors', async () => {
      crudService.createPatient.mockRejectedValue(new Error('Create failed'));

      await expect(service.createPatient({ name: 'Test', phone: '1234567890' })).rejects.toThrow('Create failed');
    });

    it('should propagate visit errors', async () => {
      visitService.addVisit.mockRejectedValue(new Error('Visit failed'));

      const visitData = {
        chiefComplaints: 'Headache',
        diagnosis: 'Migraine',
        examination: 'Normal',
        treatmentPlan: 'Rest',
        advice: 'Hydrate',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await expect(service.addVisit('pat-123', visitData)).rejects.toThrow('Visit failed');
    });
  });
});