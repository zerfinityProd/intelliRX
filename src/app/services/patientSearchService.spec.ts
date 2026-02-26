import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PatientSearchService } from './patientSearchService';
import { FirebaseService } from './firebase';
import { Patient } from '../models/patient.model';

describe('PatientSearchService', () => {
    let service: PatientSearchService;
    let firebaseService: any;

    const mockPatient: Patient = {
        uniqueId: 'pat-123',
        userId: 'user-001',
        name: 'John Doe',
        familyId: 'doe_john',
        phone: '5551234567',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
    };

    const mockPatient2: Patient = {
        uniqueId: 'pat-456',
        userId: 'user-001',
        name: 'Jane Doe',
        familyId: 'doe_jane',
        phone: '5559876543',
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02')
    };

    beforeEach(() => {
        firebaseService = {
            searchPatientByPhone: vi.fn(),
            searchPatientByFamilyId: vi.fn(),
            searchPatientByName: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [PatientSearchService, { provide: FirebaseService, useValue: firebaseService }]
        });

        service = TestBed.inject(PatientSearchService);
    });

    describe('Search Initialization', () => {
        it('should initialize with empty results', () => {
            service.searchResults$.subscribe(results => {
                expect(results).toEqual([]);
            });
        });

        it('should initialize with no pagination', () => {
            expect(service.hasMoreResults).toBe(false);
            expect(service.isLoadingMore).toBe(false);
        });
    });

    describe('Numeric Search (Phone)', () => {
        it('should search by phone for numeric term', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });

            await service.search('5551234567', 'user-001');

            expect(firebaseService.searchPatientByPhone).toHaveBeenCalledWith('5551234567', 'user-001');
        });

        it('should emit search results', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });

            let emittedResults: Patient[] = [];
            service.searchResults$.subscribe(results => {
                emittedResults = results;
            });

            await service.search('5551234567', 'user-001');

            expect(emittedResults).toEqual([mockPatient]);
        });

        it('should update hasMoreResults flag', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: { id: 'cursor1' },
                hasMore: true
            });

            await service.search('5551234567', 'user-001');

            expect(service.hasMoreResults).toBe(true);
        });
    });

    describe('Text Search (Family ID & Name)', () => {
        it('should search both family ID and name for text term', async () => {
            firebaseService.searchPatientByFamilyId.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });
            firebaseService.searchPatientByName.mockResolvedValue({
                results: [mockPatient2],
                lastDoc: null,
                hasMore: false
            });

            await service.search('john', 'user-001');

            expect(firebaseService.searchPatientByFamilyId).toHaveBeenCalledWith('john', 'user-001');
            expect(firebaseService.searchPatientByName).toHaveBeenCalledWith('john', 'user-001');
        });

        it('should merge and deduplicate results', async () => {
            firebaseService.searchPatientByFamilyId.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });
            firebaseService.searchPatientByName.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });

            let emittedResults: Patient[] = [];
            service.searchResults$.subscribe(results => {
                emittedResults = results;
            });

            await service.search('john', 'user-001');

            expect(emittedResults).toHaveLength(1);
        });

        it('should sort results by date (newest first)', async () => {
            firebaseService.searchPatientByFamilyId.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });
            firebaseService.searchPatientByName.mockResolvedValue({
                results: [mockPatient2],
                lastDoc: null,
                hasMore: false
            });

            let emittedResults: Patient[] = [];
            service.searchResults$.subscribe(results => {
                emittedResults = results;
            });

            await service.search('doe', 'user-001');

            expect(emittedResults[0].uniqueId).toBe('pat-456'); // Newest first
        });
    });

    describe('Clear Search', () => {
        it('should clear search results', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: null,
                hasMore: false
            });

            await service.search('5551234567', 'user-001');

            let emittedResults: Patient[] = [];
            service.searchResults$.subscribe(results => {
                emittedResults = results;
            });

            service.clear();

            expect(emittedResults).toEqual([]);
        });

        it('should reset pagination state', async () => {
            firebaseService.searchPatientByPhone.mockResolvedValue({
                results: [mockPatient],
                lastDoc: { id: 'cursor1' },
                hasMore: true
            });

            await service.search('5551234567', 'user-001');
            expect(service.hasMoreResults).toBe(true);

            service.clear();

            expect(service.hasMoreResults).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should emit empty results on search error', async () => {
            firebaseService.searchPatientByPhone.mockRejectedValue(new Error('Firebase error'));

            let emittedResults: Patient[] = [];
            service.searchResults$.subscribe(results => {
                emittedResults = results;
            });

            try {
                await service.search('5551234567', 'user-001');
            } catch (e) {
                // Expected to throw
            }

            expect(emittedResults).toEqual([]);
        });

        it('should handle partial failures in text search', async () => {
            firebaseService.searchPatientByFamilyId.mockRejectedValue(new Error('Family search failed'));
            firebaseService.searchPatientByName.mockResolvedValue({
                results: [mockPatient2],
                lastDoc: null,
                hasMore: false
            });

            let emittedResults: Patient[] = [];
            service.searchResults$.subscribe(results => {
                emittedResults = results;
            });

            await service.search('john', 'user-001');

            expect(emittedResults).toEqual([mockPatient2]);
        });
    });
});
