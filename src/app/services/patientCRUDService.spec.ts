import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientCRUDService } from './patientCRUDService';
import { FirebaseService } from './firebase';
import { Patient } from '../models/patient.model';

describe('PatientCRUDService', () => {
    let service: PatientCRUDService;
    let firebaseService: any;

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
        firebaseService = {
            getPatientById: vi.fn(),
            addPatient: vi.fn(),
            updatePatient: vi.fn(),
            deletePatient: vi.fn(),
            searchPatientByPhone: vi.fn(),
            searchPatientByFamilyId: vi.fn(),
            generateFamilyId: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [PatientCRUDService, { provide: FirebaseService, useValue: firebaseService }]
        });

        service = TestBed.inject(PatientCRUDService);
    });

    describe('Get Patient', () => {
        it('should fetch patient by ID', async () => {
            firebaseService.getPatientById.mockResolvedValue(mockPatient);

            const result = await service.getPatient('pat-123', 'user-001');

            expect(firebaseService.getPatientById).toHaveBeenCalledWith('pat-123', 'user-001');
            expect(result).toEqual(mockPatient);
        });

        it('should set selected patient on successful fetch', async () => {
            firebaseService.getPatientById.mockResolvedValue(mockPatient);

            let selectedPatient: Patient | null = null;
            service.selectedPatient$.subscribe(patient => {
                selectedPatient = patient;
            });

            await service.getPatient('pat-123', 'user-001');

            expect(selectedPatient).toEqual(mockPatient);
        });

        it('should return null when patient not found', async () => {
            firebaseService.getPatientById.mockResolvedValue(null);

            const result = await service.getPatient('pat-999', 'user-001');

            expect(result).toBeNull();
        });

        it('should throw error on Firebase failure', async () => {
            firebaseService.getPatientById.mockRejectedValue(new Error('Firebase error'));

            await expect(service.getPatient('pat-123', 'user-001')).rejects.toThrow();
        });
    });

    describe('Create Patient', () => {
        it('should create new patient if not exists', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [],
                lastDoc: null,
                hasMore: false
            });
            firebaseService.generateFamilyId.mockReturnValue('doe_john');
            firebaseService.addPatient.mockResolvedValue('pat-new');

            const patientData = {
                name: 'John Doe',
                phone: '5551234567'
            };

            const result = await service.createPatient(patientData, 'user-001', firebaseService);

            expect(firebaseService.addPatient).toHaveBeenCalled();
            expect(result).toBe('pat-new');
        });

        it('should update existing patient if found', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });
            firebaseService.updatePatient.mockResolvedValue(undefined);

            const patientData = {
                name: 'John Doe',
                phone: '5551234567',
                email: 'john.new@example.com'
            };

            const result = await service.createPatient(patientData, 'user-001', firebaseService);

            expect(firebaseService.updatePatient).toHaveBeenCalled();
            expect(result).toBe('pat-123');
        });
    });

    describe('Update Patient', () => {
        it('should update patient data', async () => {
            firebaseService.updatePatient.mockResolvedValue(undefined);

            const updates: Partial<Patient> = {
                email: 'newemail@example.com'
            };

            await service.updatePatient('pat-123', updates, 'user-001');

            expect(firebaseService.updatePatient).toHaveBeenCalledWith('pat-123', updates, 'user-001');
        });

        it('should throw on update error', async () => {
            firebaseService.updatePatient.mockRejectedValue(new Error('Update failed'));

            const updates: Partial<Patient> = {
                email: 'newemail@example.com'
            };

            await expect(service.updatePatient('pat-123', updates, 'user-001')).rejects.toThrow();
        });
    });

    describe('Delete Patient', () => {
        it('should delete patient', async () => {
            firebaseService.deletePatient.mockResolvedValue(undefined);

            await service.deletePatient('pat-123', 'user-001');

            expect(firebaseService.deletePatient).toHaveBeenCalledWith('pat-123', 'user-001');
        });

        it('should clear selected patient on delete', async () => {
            firebaseService.deletePatient.mockResolvedValue(undefined);

            let selectedPatient: Patient | null = mockPatient;
            service.selectedPatient$.subscribe(patient => {
                selectedPatient = patient;
            });

            await service.deletePatient('pat-123', 'user-001');

            expect(selectedPatient).toBeNull();
        });

        it('should throw on delete error', async () => {
            firebaseService.deletePatient.mockRejectedValue(new Error('Delete failed'));

            await expect(service.deletePatient('pat-123', 'user-001')).rejects.toThrow();
        });
    });

    describe('Select Patient', () => {
        it('should set selected patient', () => {
            let selectedPatient: Patient | null = null;
            service.selectedPatient$.subscribe(patient => {
                selectedPatient = patient;
            });

            service.selectPatient(mockPatient);

            expect(selectedPatient).toEqual(mockPatient);
        });

        it('should clear selected patient', () => {
            let selectedPatient: Patient | null = mockPatient;
            service.selectedPatient$.subscribe(patient => {
                selectedPatient = patient;
            });

            service.selectPatient(null);

            expect(selectedPatient).toBeNull();
        });
    });

    describe('Existence Checks', () => {
        it('should check if unique ID exists', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });

            const exists = await service.checkUniqueIdExists('John Doe', '5551234567', 'user-001');

            expect(exists).toBe(true);
        });

        it('should return false if unique ID does not exist', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [],
                lastDoc: null,
                hasMore: false
            });

            const exists = await service.checkUniqueIdExists('Jane Doe', '5559876543', 'user-001');

            expect(exists).toBe(false);
        });

        it('should check if family ID exists', async () => {
            firebaseService.searchPatientByFamilyId.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });

            const exists = await service.checkFamilyIdExists('doe_john', 'user-001');

            expect(exists).toBe(true);
        });

        it('should return false if family ID does not exist', async () => {
            firebaseService.searchPatientByFamilyId.mockResolvedValue({
                results: [],
                lastDoc: null,
                hasMore: false
            });

            const exists = await service.checkFamilyIdExists('smith_jane', 'user-001');

            expect(exists).toBe(false);
        });
    });
});
