import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { Patient } from '../models/patient.model';
import { QueryDocumentSnapshot, DocumentData } from '@angular/fire/firestore';

/**
 * Pagination state for a single search query
 */
interface PaginationState {
    lastPhoneDoc: QueryDocumentSnapshot<DocumentData> | null;
    lastFamilyDoc: QueryDocumentSnapshot<DocumentData> | null;
    lastNameDoc: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean;
}

/**
 * Manages patient search and pagination
 * Handles search queries, result caching, and pagination state
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
        lastPhoneDoc: null,
        lastFamilyDoc: null,
        lastNameDoc: null,
        hasMore: false
    };

    public hasMoreResults: boolean = false;
    public isLoadingMore: boolean = false;

    constructor(private firebaseService: FirebaseService) { }

    /**
     * Execute new search (resets pagination)
     */
    async search(searchTerm: string, userId: string): Promise<void> {
        try {
            const trimmedTerm = searchTerm.trim();

            // Reset pagination state
            this.resetPaginationState();
            this.currentSearchTerm = trimmedTerm;
            this.currentIsNumeric = /^\d+$/.test(trimmedTerm);

            console.log('🔍 Searching for:', trimmedTerm);

            let allResults: Patient[] = [];

            if (this.currentIsNumeric) {
                // Run phone prefix search AND contains search in parallel
                const [phoneSettled, containsSettled] = await Promise.allSettled([
                    this.firebaseService.searchPatientByPhone(trimmedTerm, userId),
                    this.firebaseService.searchPatientsContaining(trimmedTerm, userId)
                ]);

                const phoneResult = phoneSettled.status === 'fulfilled' ? phoneSettled.value : { results: [], lastDoc: null, hasMore: false };
                const containsResult = containsSettled.status === 'fulfilled' ? containsSettled.value : { results: [], lastDoc: null, hasMore: false };

                this.paginationState.lastPhoneDoc = phoneResult.lastDoc;
                this.paginationState.hasMore = phoneResult.hasMore;

                allResults = this.mergeAndDeduplicateResults(phoneResult.results, containsResult.results);
            } else {
                // Run family, name prefix searches AND contains search in parallel
                const [familySettled, nameSettled, containsSettled] = await Promise.allSettled([
                    this.firebaseService.searchPatientByFamilyId(trimmedTerm.toLowerCase(), userId),
                    this.firebaseService.searchPatientByName(trimmedTerm, userId),
                    this.firebaseService.searchPatientsContaining(trimmedTerm, userId)
                ]);

                const familyResult = familySettled.status === 'fulfilled' ? familySettled.value : { results: [], lastDoc: null, hasMore: false };
                const nameResult = nameSettled.status === 'fulfilled' ? nameSettled.value : { results: [], lastDoc: null, hasMore: false };
                const containsResult = containsSettled.status === 'fulfilled' ? containsSettled.value : { results: [], lastDoc: null, hasMore: false };

                this.paginationState.lastFamilyDoc = familyResult.lastDoc;
                this.paginationState.lastNameDoc = nameResult.lastDoc;
                this.paginationState.hasMore = familyResult.hasMore || nameResult.hasMore;

                // Merge and deduplicate results from all sources
                const prefixResults = this.mergeAndDeduplicateResults(familyResult.results, nameResult.results);
                allResults = this.mergeAndDeduplicateResults(prefixResults, containsResult.results);
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
    async loadMore(userId: string): Promise<void> {
        if (!this.hasMoreResults || this.isLoadingMore) return;

        try {
            this.isLoadingMore = true;
            let newResults: Patient[] = [];

            if (this.currentIsNumeric) {
                const { results, lastDoc, hasMore } = await this.firebaseService.searchPatientByPhone(
                    this.currentSearchTerm,
                    userId,
                    this.paginationState.lastPhoneDoc
                );
                newResults = results;
                this.paginationState.lastPhoneDoc = lastDoc;
                this.paginationState.hasMore = hasMore;
            } else {
                const [familySettled, nameSettled] = await Promise.allSettled([
                    this.paginationState.lastFamilyDoc !== null
                        ? this.firebaseService.searchPatientByFamilyId(
                            this.currentSearchTerm.toLowerCase(),
                            userId,
                            this.paginationState.lastFamilyDoc
                        )
                        : Promise.resolve({ results: [], lastDoc: null, hasMore: false }),
                    this.paginationState.lastNameDoc !== null
                        ? this.firebaseService.searchPatientByName(
                            this.currentSearchTerm,
                            userId,
                            this.paginationState.lastNameDoc
                        )
                        : Promise.resolve({ results: [], lastDoc: null, hasMore: false })
                ]);

                const familyResult = familySettled.status === 'fulfilled' ? familySettled.value : { results: [], lastDoc: null, hasMore: false };
                const nameResult = nameSettled.status === 'fulfilled' ? nameSettled.value : { results: [], lastDoc: null, hasMore: false };

                this.paginationState.lastFamilyDoc = familyResult.lastDoc;
                this.paginationState.lastNameDoc = nameResult.lastDoc;
                this.paginationState.hasMore = familyResult.hasMore || nameResult.hasMore;

                // Merge new results, filtering out duplicates
                const existingIds = new Set(this.cachedResults.map(p => p.uniqueId));
                newResults = this.mergeAndDeduplicateResults(
                    familyResult.results,
                    nameResult.results
                ).filter(p => !existingIds.has(p.uniqueId));
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

    /**
     * Private: Reset pagination cursors
     */
    private resetPaginationState(): void {
        this.paginationState = {
            lastPhoneDoc: null,
            lastFamilyDoc: null,
            lastNameDoc: null,
            hasMore: false
        };
    }

    /**
     * Private: Merge and deduplicate results from multiple sources
     */
    private mergeAndDeduplicateResults(
        familyResults: Patient[],
        nameResults: Patient[]
    ): Patient[] {
        const seen = new Set<string>();
        const merged: Patient[] = [];

        for (const patient of [...familyResults, ...nameResults]) {
            if (!seen.has(patient.uniqueId)) {
                seen.add(patient.uniqueId);
                merged.push(patient);
            }
        }

        // Sort by newest first
        return this.sortByDate(merged);
    }

    /**
     * Private: Update cached results and emit
     */
    private updateResults(results: Patient[]): void {
        this.cachedResults = results;
        this.searchResultsSubject.next(results);
    }

    /**
     * Private: Sort patients by creation date (newest first)
     */
    private sortByDate(patients: Patient[]): Patient[] {
        return patients.sort((a, b) => {
            const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
            const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });
    }
}