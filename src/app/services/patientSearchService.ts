import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
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

    constructor(private firebaseService: FirebaseService, private clinicContextService: ClinicContextService) { }

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

            if (this.currentIsNumeric) {
                // Run phone prefix search AND contains search in parallel
                const [phoneSettled, containsSettled] = await Promise.allSettled([
                    this.firebaseService.searchPatientByPhone(trimmedTerm, null, clinicId),
                    this.firebaseService.searchPatientsContaining(trimmedTerm, clinicId)
                ]);

                const phoneResult = phoneSettled.status === 'fulfilled' ? phoneSettled.value : { results: [], lastCursor: null, hasMore: false };
                const containsResult = containsSettled.status === 'fulfilled' ? containsSettled.value : { results: [], lastCursor: null, hasMore: false };

                this.paginationState.lastPhoneCursor = phoneResult.lastCursor;
                this.paginationState.hasMore = phoneResult.hasMore;

                allResults = this.mergeAndDeduplicateResults(phoneResult.results, containsResult.results);
            } else {
                // Run name prefix search AND contains search in parallel
                const [nameSettled, containsSettled] = await Promise.allSettled([
                    this.firebaseService.searchPatientByName(trimmedTerm, null, clinicId),
                    this.firebaseService.searchPatientsContaining(trimmedTerm, clinicId)
                ]);

                const nameResult = nameSettled.status === 'fulfilled' ? nameSettled.value : { results: [], lastCursor: null, hasMore: false };
                const containsResult = containsSettled.status === 'fulfilled' ? containsSettled.value : { results: [], lastCursor: null, hasMore: false };

                this.paginationState.lastNameCursor = nameResult.lastCursor;
                this.paginationState.hasMore = nameResult.hasMore;

                allResults = this.mergeAndDeduplicateResults(nameResult.results, containsResult.results);
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