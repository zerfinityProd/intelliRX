import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientVisitService } from './patientVisitService';
import { FirebaseService } from './firebase';

describe('PatientVisitService', () => {
    let service: PatientVisitService;
    let firebaseService: any;

    const mockVisitData = {
        chiefComplaints: 'Fever',
        diagnosis: 'Common Cold',
        examination: 'Temperature 101F',
        treatmentPlan: 'Rest and hydration',
        advice: 'Take fluids'
    };

    beforeEach(() => {
        firebaseService = {
            addVisit: vi.fn(),
            getVisits: vi.fn(),
            deleteVisit: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [PatientVisitService, { provide: FirebaseService, useValue: firebaseService }]
        });

        service = TestBed.inject(PatientVisitService);
    });

    describe('Add Visit', () => {
        it('should add visit to patient', async () => {
            firebaseService.addVisit.mockResolvedValue('visit-123');

            const result = await service.addVisit('pat-123', mockVisitData, 'user-001');

            expect(firebaseService.addVisit).toHaveBeenCalledWith('pat-123', mockVisitData, 'user-001');
            expect(result).toBe('visit-123');
        });

        it('should add visit with minimal data', async () => {
            const minimalVisit = {
                chiefComplaints: 'Fever',
                diagnosis: 'Fever',
                examination: 'Normal',
                treatmentPlan: 'Rest',
                advice: 'Hydrate'
            };
            firebaseService.addVisit.mockResolvedValue('visit-124');

            const result = await service.addVisit('pat-123', minimalVisit, 'user-001');

            expect(firebaseService.addVisit).toHaveBeenCalledWith('pat-123', minimalVisit, 'user-001');
            expect(result).toBe('visit-124');
        });

        it('should throw on Firebase error', async () => {
            firebaseService.addVisit.mockRejectedValue(new Error('Firebase error'));

            await expect(service.addVisit('pat-123', mockVisitData, 'user-001')).rejects.toThrow();
        });

        it('should throw if patient ID is missing', async () => {
            firebaseService.addVisit.mockRejectedValue(new Error('Patient ID required'));

            await expect(service.addVisit('', mockVisitData, 'user-001')).rejects.toThrow();
        });

        it('should throw if user ID is missing', async () => {
            firebaseService.addVisit.mockRejectedValue(new Error('User ID required'));

            await expect(service.addVisit('pat-123', mockVisitData, '')).rejects.toThrow();
        });
    });

    describe('Get Visits', () => {
        it('should retrieve visits for patient', async () => {
            const mockVisit = {
                id: 'visit-123',
                patientId: 'pat-123',
                ...mockVisitData,
                createdAt: new Date('2024-01-15'),
                updatedAt: new Date('2024-01-15')
            };
            firebaseService.getVisits.mockResolvedValue([mockVisit]);

            const result = await service.getVisits('pat-123', 'user-001');

            expect(firebaseService.getVisits).toHaveBeenCalledWith('pat-123', 'user-001');
            expect(result).toContainEqual(mockVisit);
        });

        it('should return empty array if no visits exist', async () => {
            firebaseService.getVisits.mockResolvedValue([]);

            const result = await service.getVisits('pat-123', 'user-001');

            expect(result).toEqual([]);
        });

        it('should return multiple visits sorted by date', async () => {
            const visit1 = {
                id: 'visit-1',
                chiefComplaints: 'Flu',
                diagnosis: 'Flu',
                examination: 'Normal',
                treatmentPlan: 'Rest',
                advice: 'Hydrate',
                createdAt: new Date('2024-01-10'),
                updatedAt: new Date('2024-01-10')
            };
            const visit2 = {
                id: 'visit-2',
                chiefComplaints: 'Cold',
                diagnosis: 'Cold',
                examination: 'Normal',
                treatmentPlan: 'Rest',
                advice: 'Hydrate',
                createdAt: new Date('2024-01-15'),
                updatedAt: new Date('2024-01-15')
            };
            firebaseService.getVisits.mockResolvedValue([visit1, visit2]);

            const result = await service.getVisits('pat-123', 'user-001');

            expect(result.length).toBe(2);
            expect(result[0].id).toBe('visit-1');
            expect(result[1].id).toBe('visit-2');
        });

        it('should throw on Firebase error', async () => {
            firebaseService.getVisits.mockRejectedValue(new Error('Firebase error'));

            await expect(service.getVisits('pat-123', 'user-001')).rejects.toThrow();
        });

        it('should throw if patient ID is missing', async () => {
            firebaseService.getVisits.mockRejectedValue(new Error('Patient ID required'));

            await expect(service.getVisits('', 'user-001')).rejects.toThrow();
        });
    });

    describe('Delete Visit', () => {
        it('should delete visit from patient', async () => {
            firebaseService.deleteVisit.mockResolvedValue(undefined);

            await service.deleteVisit('pat-123', 'visit-123', 'user-001');

            expect(firebaseService.deleteVisit).toHaveBeenCalledWith('pat-123', 'visit-123', 'user-001');
        });

        it('should handle deletion of visit that does not exist', async () => {
            firebaseService.deleteVisit.mockResolvedValue(undefined);

            await service.deleteVisit('pat-123', 'visit-999', 'user-001');

            expect(firebaseService.deleteVisit).toHaveBeenCalledWith('pat-123', 'visit-999', 'user-001');
        });

        it('should throw on Firebase error', async () => {
            firebaseService.deleteVisit.mockRejectedValue(new Error('Firebase error'));

            await expect(service.deleteVisit('pat-123', 'visit-123', 'user-001')).rejects.toThrow();
        });

        it('should throw if patient ID is missing', async () => {
            firebaseService.deleteVisit.mockRejectedValue(new Error('Patient ID required'));

            await expect(service.deleteVisit('', 'visit-123', 'user-001')).rejects.toThrow();
        });

        it('should throw if visit ID is missing', async () => {
            firebaseService.deleteVisit.mockRejectedValue(new Error('Visit ID required'));

            await expect(service.deleteVisit('pat-123', '', 'user-001')).rejects.toThrow();
        });

        it('should throw if user ID is missing', async () => {
            firebaseService.deleteVisit.mockRejectedValue(new Error('User ID required'));

            await expect(service.deleteVisit('pat-123', 'visit-123', '')).rejects.toThrow();
        });
    });

    describe('Integration Scenarios', () => {
        it('should add multiple visits sequentially', async () => {
            firebaseService.addVisit.mockResolvedValueOnce('visit-1').mockResolvedValueOnce('visit-2');

            const visit1 = await service.addVisit('pat-123', {
                chiefComplaints: 'Flu',
                diagnosis: 'Flu',
                examination: 'Normal',
                treatmentPlan: 'Rest',
                advice: 'Hydrate'
            }, 'user-001');

            const visit2 = await service.addVisit('pat-123', {
                chiefComplaints: 'Cold',
                diagnosis: 'Cold',
                examination: 'Normal',
                treatmentPlan: 'Rest',
                advice: 'Hydrate'
            }, 'user-001');

            expect(visit1).toBe('visit-1');
            expect(visit2).toBe('visit-2');
            expect(firebaseService.addVisit).toHaveBeenCalledTimes(2);
        });

        it('should get visits after adding', async () => {
            firebaseService.addVisit.mockResolvedValue('visit-new');
            const mockVisits = [
                {
                    id: 'visit-new',
                    chiefComplaints: 'Cold',
                    diagnosis: 'Cold',
                    examination: 'Normal',
                    treatmentPlan: 'Rest',
                    advice: 'Hydrate',
                    createdAt: new Date('2024-01-15'),
                    updatedAt: new Date('2024-01-15')
                }
            ];
            firebaseService.getVisits.mockResolvedValue(mockVisits);

            await service.addVisit('pat-123', mockVisitData, 'user-001');
            const result = await service.getVisits('pat-123', 'user-001');

            expect(result).toContainEqual(mockVisits[0]);
        });

        it('should delete visit and verify removal', async () => {
            firebaseService.deleteVisit.mockResolvedValue(undefined);
            firebaseService.getVisits.mockResolvedValue([]);

            await service.deleteVisit('pat-123', 'visit-123', 'user-001');
            const result = await service.getVisits('pat-123', 'user-001');

            expect(result).toEqual([]);
        });
    });
});
