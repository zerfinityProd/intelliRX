// src/app/services/patientSearchService.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PatientRepository } from '../repositories/interfaces/patient.repository';
import { ClinicContextService } from './clinicContextService';
import { ConfigService } from './configService';
import { Patient } from '../models/patient.model';

interface PaginationState {
    lastPhoneCursor: any;
    lastNameCursor: any;
    hasMore: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class PatientSearchService {
    private readonly searchResultsSubject = new BehaviorSubject<Patient[]>([]);
    searchResults$: Observable<Patient[]> = this.searchResultsSubject.asObservable();

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

    constructor(
        private patientRepo: PatientRepository,
        private clinicContextService: ClinicContextService,
        private configService: ConfigService
    ) { }

    private async resolveSearchClinicId(): Promise<string | undefined> {
        try {
            const subId = this.clinicContextService.getSubscriptionId();
            if (subId) {
                const subConfig = await this.configService.getSubscriptionConfig(subId);
                if (subConfig?.multiClinic?.share_patients_across_clinics) {
                    return undefined;
                }
            }
        } catch { /* fall through */ }
        return this.clinicContextService.getSelectedClinicId() || undefined;
    }

    private looksLikePatientId(term: string): boolean {
        return /^20\d{9}$/.test(term);
    }

    async search(searchTerm: string): Promise<void> {
        try {
            const trimmedTerm = searchTerm.trim();
            this.resetPaginationState();
            this.currentSearchTerm = trimmedTerm;
            this.currentIsNumeric = /^\d+$/.test(trimmedTerm);

            let allResults: Patient[] = [];
            const clinicId = await this.resolveSearchClinicId();
            const emptyResult = { results: [] as Patient[], lastCursor: null, hasMore: false };

            const idLookupPromise = this.looksLikePatientId(trimmedTerm)
                ? this.patientRepo.getPatientById(trimmedTerm).catch(() => null)
                : Promise.resolve(null);

            if (this.currentIsNumeric) {
                const [phoneSettled, containsSettled, idResult] = await Promise.all([
                    clinicId
                        ? Promise.resolve(emptyResult)
                        : this.patientRepo.searchPatientByPhone(trimmedTerm, null, undefined)
                            .catch(() => emptyResult),
                    this.patientRepo.searchPatientsContaining(trimmedTerm, clinicId)
                        .catch(() => emptyResult),
                    idLookupPromise
                ]);
                this.paginationState.lastPhoneCursor = phoneSettled.lastCursor;
                this.paginationState.hasMore = phoneSettled.hasMore;
                const idResults = idResult ? [idResult] : [];
                allResults = this.mergeAndDeduplicateResults(
                    idResults,
                    phoneSettled.results,
                    containsSettled.results
                );
            } else {
                const [nameSettled, containsSettled, idResult] = await Promise.all([
                    clinicId
                        ? Promise.resolve(emptyResult)
                        : this.patientRepo.searchPatientByName(trimmedTerm, null, undefined)
                            .catch(() => emptyResult),
                    this.patientRepo.searchPatientsContaining(trimmedTerm, clinicId)
                        .catch(() => emptyResult),
                    idLookupPromise
                ]);
                this.paginationState.lastNameCursor = nameSettled.lastCursor;
                this.paginationState.hasMore = nameSettled.hasMore;
                const idResults = idResult ? [idResult] : [];
                allResults = this.mergeAndDeduplicateResults(
                    idResults,
                    nameSettled.results,
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

    async loadMore(): Promise<void> {
        if (!this.hasMoreResults || this.isLoadingMore) return;
        try {
            this.isLoadingMore = true;
            let newResults: Patient[] = [];
            const clinicId = await this.resolveSearchClinicId();

            if (this.currentIsNumeric) {
                const { results, lastCursor, hasMore } = await this.patientRepo.searchPatientByPhone(
                    this.currentSearchTerm,
                    this.paginationState.lastPhoneCursor,
                    clinicId
                );
                newResults = results;
                this.paginationState.lastPhoneCursor = lastCursor;
                this.paginationState.hasMore = hasMore;
            } else {
                const { results, lastCursor, hasMore } = await this.patientRepo.searchPatientByName(
                    this.currentSearchTerm,
                    this.paginationState.lastNameCursor,
                    clinicId
                );
                // Single pass to construct ID set without intermediate .map() allocation
                const existingIds = new Set<string>();
                for (let i = 0; i < this.cachedResults.length; i++) {
                    const id = this.cachedResults[i].id;
                    if (id) existingIds.add(id);
                }
                newResults = results.filter(p => p.id !== undefined && !existingIds.has(p.id));
                this.paginationState.lastNameCursor = lastCursor;
                this.paginationState.hasMore = hasMore;
            }

            const combined = [...this.cachedResults, ...newResults];
            this.updateResults(combined);
            this.hasMoreResults = this.paginationState.hasMore;
        } catch (error) {
            console.error('❌ Load more error:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    clear(): void {
        this.currentSearchTerm = '';
        this.currentIsNumeric = false;
        this.cachedResults = [];
        this.hasMoreResults = false;
        this.resetPaginationState();
        this.searchResultsSubject.next([]);
    }

    private resetPaginationState(): void {
        this.paginationState = { lastPhoneCursor: null, lastNameCursor: null, hasMore: false };
    }

    /**
     * Deduplicates patients across multiple result arrays without creating
     * intermediate array concatenations.
     */
    private mergeAndDeduplicateResults(...resultSets: Patient[][]): Patient[] {
        const seen = new Set<string>();
        const merged: Patient[] = [];
        for (let i = 0; i < resultSets.length; i++) {
            const list = resultSets[i];
            for (let j = 0; j < list.length; j++) {
                const patient = list[j];
                const key = patient.id || '';
                if (key && !seen.has(key)) {
                    seen.add(key);
                    merged.push(patient);
                }
            }
        }
        return merged;
    }

    private updateResults(results: Patient[]): void {
        this.cachedResults = results;
        this.searchResultsSubject.next(results);
    }
}