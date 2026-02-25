import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientService } from './patient';
import { FirebaseService } from './firebase';
import { AuthenticationService } from './authenticationService';
import { NgZone } from '@angular/core';

describe('PatientService', () => {
  let service: PatientService;
  let firebaseServiceMock: any;
  let authServiceMock: any;
  let ngZoneMock: any;

  const mockPatient = {
    uniqueId: 'doe_john_1234567890_user123',
    userId: 'user123',
    familyId: 'doe_john',
    name: 'John Doe',
    phone: '1234567890',
    email: 'john@email.com',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'Male',
    allergies: 'None',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    firebaseServiceMock = {
      addPatient: vi.fn(),
      updatePatient: vi.fn(),
      searchPatientByPhone: vi.fn(),
      searchPatientByFamilyId: vi.fn(),
      getPatientById: vi.fn(),
      generateFamilyId: vi.fn(),
      addVisit: vi.fn(),
      getPatientVisits: vi.fn()
    };

    authServiceMock = {
      getCurrentUserId: vi.fn().mockReturnValue('user123')
    };

    ngZoneMock = {
      run: vi.fn((fn) => fn())
    };

    TestBed.configureTestingModule({
      providers: [
        PatientService,
        { provide: FirebaseService, useValue: firebaseServiceMock },
        { provide: AuthenticationService, useValue: authServiceMock },
        { provide: NgZone, useValue: ngZoneMock }
      ]
    });

    service = TestBed.inject(PatientService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create a new patient when no duplicate exists', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([]);
    firebaseServiceMock.generateFamilyId.mockReturnValue('doe_john');
    firebaseServiceMock.addPatient.mockResolvedValue('doe_john_1234567890_user123');

    const result = await service.createPatient({
      name: 'John Doe',
      phone: '1234567890'
    });

    expect(result).toBe('doe_john_1234567890_user123');
    expect(firebaseServiceMock.addPatient).toHaveBeenCalled();
  });

  it('should update existing patient when duplicate found', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([mockPatient]);
    firebaseServiceMock.updatePatient.mockResolvedValue(undefined);

    const result = await service.createPatient({
      name: 'John Doe',
      phone: '1234567890'
    });

    expect(result).toBe(mockPatient.uniqueId);
    expect(firebaseServiceMock.updatePatient).toHaveBeenCalled();
  });

  it('should search patients by phone number', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([mockPatient]);

    await service.searchPatients('1234567890');

    expect(firebaseServiceMock.searchPatientByPhone).toHaveBeenCalled();
  });

  it('should search patients by name', async () => {
    firebaseServiceMock.searchPatientByFamilyId.mockResolvedValue([mockPatient]);

    await service.searchPatients('john doe');

    expect(firebaseServiceMock.searchPatientByFamilyId).toHaveBeenCalled();
  });

  it('should detect numeric search terms as phone searches', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([]);

    await service.searchPatients('9876543210');

    expect(firebaseServiceMock.searchPatientByPhone).toHaveBeenCalled();
    expect(firebaseServiceMock.searchPatientByFamilyId).not.toHaveBeenCalled();
  });

  it('should detect non-numeric search terms as name searches', async () => {
    firebaseServiceMock.searchPatientByFamilyId.mockResolvedValue([]);

    await service.searchPatients('Jane Smith');

    expect(firebaseServiceMock.searchPatientByFamilyId).toHaveBeenCalled();
    expect(firebaseServiceMock.searchPatientByPhone).not.toHaveBeenCalled();
  });

  it('should use cached results for repeated searches', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([mockPatient]);

    await service.searchPatients('1234567890');
    await service.searchPatients('1234567890');

    expect(firebaseServiceMock.searchPatientByPhone).toHaveBeenCalledTimes(1);
  });

  it('should clear search results', () => {
    service.clearSearchResults();

    service.searchResults$.subscribe(results => {
      expect(results.length).toBe(0);
    });
  });

  it('should validate correct phone number format', () => {
    expect(service.isValidPhone('1234567890')).toBe(true);
    expect(service.isValidPhone('12345')).toBe(false);
  });

  it('should validate correct email format', () => {
    expect(service.isValidEmail('test@example.com')).toBe(true);
    expect(service.isValidEmail('invalid-email')).toBe(false);
  });

  it('should add a visit to a patient', async () => {
    firebaseServiceMock.addVisit.mockResolvedValue('visit-123');

    const visitId = await service.addVisit('patient-123', {
      chiefComplaints: 'Fever',
      diagnosis: 'Viral',
      examination: 'Normal',
      treatmentPlan: 'Rest',
      advice: 'Hydrate'
    });

    expect(visitId).toBe('visit-123');
  });

  it('should get patient by ID', async () => {
    firebaseServiceMock.getPatientById.mockResolvedValue(mockPatient);

    const result = await service.getPatient(mockPatient.uniqueId);

    expect(result).toEqual(mockPatient);
  });

  it('should get all visits for a patient', async () => {
    const mockVisits = [
      {
        id: 'visit-1',
        chiefComplaints: 'Fever',
        diagnosis: 'Viral',
        examination: 'Normal',
        treatmentPlan: 'Rest',
        advice: 'Hydrate',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    firebaseServiceMock.getPatientVisits.mockResolvedValue(mockVisits);

    const visits = await service.getPatientVisits('patient-123');

    expect(visits.length).toBe(1);
    expect(visits[0].diagnosis).toBe('Viral');
  });

  it('should update patient information', async () => {
    const updateData = {
      email: 'newemail@example.com',
      allergies: 'Penicillin'
    };

    firebaseServiceMock.updatePatient.mockResolvedValue(undefined);

    await service.updatePatient(mockPatient.uniqueId, updateData);

    expect(firebaseServiceMock.updatePatient).toHaveBeenCalledWith(
      mockPatient.uniqueId,
      updateData,
      'user123'
    );
  });

  it('should throw error when user is not authenticated', async () => {
    authServiceMock.getCurrentUserId.mockReturnValue(null);

    await expect(
      service.createPatient({ name: 'Test', phone: '1234567890' })
    ).rejects.toThrow('User not authenticated');
  });

  it('should handle case-insensitive name matching', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([mockPatient]);

    const result = await service.findExistingPatient('JOHN DOE', '1234567890');

    expect(result).toEqual(mockPatient);
  });

  it('should return null if no name match found', async () => {
    firebaseServiceMock.searchPatientByPhone.mockResolvedValue([mockPatient]);

    const result = await service.findExistingPatient('Different Name', '1234567890');

    expect(result).toBeNull();
  });
});