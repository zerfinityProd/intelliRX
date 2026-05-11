import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PatientDataService } from './firebase';
import { ClinicContextService } from './clinicContextService';
import { Patient } from '../models/patient.model';

/**
 * Pagination state for a single search query
 */
interface PaginationState {
    lastPhoneCursor: any;
    lastNameCursor: any;
    hasMore: boolean;
}

/**
 * Manages patient search and pagination
 */
@Injectable({
    providedIn: 'root'
})
export class PatientSearchService {
    private readonly searchResultsSubject = new BehaviorSubject<Patient[]>([]);
    searchResults$: Observable<Patient[]> = this.searchResultsSubject.asObservable();

    // Search state
    private currentSearchTerm: string = '';
    private currentIsNumeric: boolean = false;
    private cachedResults: Patient[] = [];
    private paginationState: PaginationState = {
        lastPhoneCursor: null,
        lastNameCursor: null,
        hasMore: false
    };

    public hasMoreResults: boolean = false;
    public isLoadingMore: boolean = false;

    constructor(private firebaseService: PatientDataService, private clinicContextService: ClinicContextService) { }

    /**
     * Execute new search (resets pagination)
     */
    async search(searchTerm: string): Promise<void> {
        try {
            const trimmedTerm = searchTerm.trim();

            // Reset pagination state
            this.resetPaginationState();
            this.currentSearchTerm = trimmedTerm;
            this.currentIsNumeric = /^\d+$/.test(trimmedTerm);

            console.log('🔍 Searching for:', trimmedTerm);

            let allResults: Patient[] = [];
            const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;

            // Always try a direct patient ID lookup in parallel
            const idLookupPromise = this.firebaseService.getPatientById(trimmedTerm)
                .catch(() => null);

            if (this.currentIsNumeric) {
                // Run phone prefix search AND contains search in parallel
                const [phoneSettled, containsSettled, idResult] = await Promise.all([
                    this.firebaseService.searchPatientByPhone(trimmedTerm, null, clinicId)
                        .catch(() => ({ results: [] as Patient[], lastCursor: null, hasMore: false })),
                    this.firebaseService.searchPatientsContaining(trimmedTerm, clinicId)
                        .catch(() => ({ results: [] as Patient[], lastCursor: null, hasMore: false })),
                    idLookupPromise
                ]);

                this.paginationState.lastPhoneCursor = phoneSettled.lastCursor;
                this.paginationState.hasMore = phoneSettled.hasMore;

                const idResults = idResult ? [idResult] : [];
                allResults = this.mergeAndDeduplicateResults(
                    [...idResults, ...phoneSettled.results],
                    containsSettled.results
                );
            } else {
                // Run name prefix search AND contains search in parallel
                const [nameSettled, containsSettled, idResult] = await Promise.all([
                    this.firebaseService.searchPatientByName(trimmedTerm, null, clinicId)
                        .catch(() => ({ results: [] as Patient[], lastCursor: null, hasMore: false })),
                    this.firebaseService.searchPatientsContaining(trimmedTerm, clinicId)
                        .catch(() => ({ results: [] as Patient[], lastCursor: null, hasMore: false })),
                    idLookupPromise
                ]);

                this.paginationState.lastNameCursor = nameSettled.lastCursor;
                this.paginationState.hasMore = nameSettled.hasMore;

                const idResults = idResult ? [idResult] : [];
                allResults = this.mergeAndDeduplicateResults(
                    [...idResults, ...nameSettled.results],
                    containsSettled.results
                );
            }

            this.updateResults(allResults);
            this.hasMoreResults = this.paginationState.hasMore;
        } catch (error) {
            console.error('❌ Search error:', error);
            this.searchResultsSubject.next([]);
            throw error;
        }
    }

    /**
     * Load next page of results (appends to current)
     */
    async loadMore(): Promise<void> {
        if (!this.hasMoreResults || this.isLoadingMore) return;

        try {
            this.isLoadingMore = true;
            let newResults: Patient[] = [];

            if (this.currentIsNumeric) {
                const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;
                const { results, lastCursor, hasMore } = await this.firebaseService.searchPatientByPhone(
                    this.currentSearchTerm,
                    this.paginationState.lastPhoneCursor,
                    clinicId
                );
                newResults = results;
                this.paginationState.lastPhoneCursor = lastCursor;
                this.paginationState.hasMore = hasMore;
            } else {
                const clinicId = this.clinicContextService.getSelectedClinicId() || undefined;
                const { results, lastCursor, hasMore } = await this.firebaseService.searchPatientByName(
                    this.currentSearchTerm,
                    this.paginationState.lastNameCursor,
                    clinicId
                );

                // Filter out duplicates
                const existingIds = new Set(this.cachedResults.map(p => p.id));
                newResults = results.filter(p => !existingIds.has(p.id));
                this.paginationState.lastNameCursor = lastCursor;
                this.paginationState.hasMore = hasMore;
            }

            // Append new results
            const combined = [...this.cachedResults, ...newResults];
            this.updateResults(combined);
            this.hasMoreResults = this.paginationState.hasMore;
        } catch (error) {
            console.error('❌ Load more error:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    /**
     * Clear all search results and reset state
     */
    clear(): void {
        this.currentSearchTerm = '';
        this.currentIsNumeric = false;
        this.cachedResults = [];
        this.hasMoreResults = false;
        this.resetPaginationState();
        this.searchResultsSubject.next([]);
    }

    private resetPaginationState(): void {
        this.paginationState = {
            lastPhoneCursor: null,
            lastNameCursor: null,
            hasMore: false
        };
    }

    /**
     * Merge and deduplicate results from multiple sources
     */
    private mergeAndDeduplicateResults(
        results1: Patient[],
        results2: Patient[]
    ): Patient[] {
        const seen = new Set<string>();
        const merged: Patient[] = [];

        for (const patient of [...results1, ...results2]) {
            const key = patient.id || '';
            if (key && !seen.has(key)) {
                seen.add(key);
                merged.push(patient);
            }
        }

        return merged;
    }

    private updateResults(results: Patient[]): void {
        this.cachedResults = results;
        this.searchResultsSubject.next(results);
    }
}