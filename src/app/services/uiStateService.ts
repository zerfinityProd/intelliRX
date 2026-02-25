import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Patient } from '../models/patient.model';

/**
 * UI component state interface
 */
interface UIState {
    showAddPatientForm: boolean;
    isFabOpen: boolean;
    showAddVisitForm: boolean;
    selectedPatientForVisit: Patient | null;
    isEditingPatientForVisit: boolean;
    isUserMenuOpen: boolean;
}

/**
 * Manages UI component state (modals, forms, menus)
 * Centralizes all UI-related state for HomeComponent
 */
@Injectable({
    providedIn: 'root'
})
export class UIStateService {
    private readonly initialState: UIState = {
        showAddPatientForm: false,
        isFabOpen: false,
        showAddVisitForm: false,
        selectedPatientForVisit: null,
        isEditingPatientForVisit: false,
        isUserMenuOpen: false
    };

    private readonly uiState$ = new BehaviorSubject<UIState>(this.initialState);

    /**
     * Observable for all UI state changes
     */
    getUIState(): Observable<UIState> {
        return this.uiState$.asObservable();
    }

    /**
     * Get current UI state synchronously
     */
    getCurrentUIState(): UIState {
        return this.uiState$.value;
    }

    /**
     * Open add patient form and close FAB
     */
    openAddPatientForm(): void {
        this.updateUIState({
            showAddPatientForm: true,
            isFabOpen: false
        });
    }

    /**
     * Close add patient form
     */
    closeAddPatientForm(): void {
        this.updateUIState({ showAddPatientForm: false });
    }

    /**
     * Toggle floating action button
     */
    toggleFab(): void {
        this.updateUIState({ isFabOpen: !this.uiState$.value.isFabOpen });
    }

    /**
     * Close FAB
     */
    closeFab(): void {
        this.updateUIState({ isFabOpen: false });
    }

    /**
     * Open add visit form for a patient
     */
    openAddVisitForm(patient: Patient): void {
        this.updateUIState({
            selectedPatientForVisit: patient,
            showAddVisitForm: true,
            isEditingPatientForVisit: false,
            isFabOpen: false
        });
    }

    /**
     * Close add visit form
     */
    closeAddVisitForm(): void {
        this.updateUIState({
            showAddVisitForm: false,
            selectedPatientForVisit: null,
            isEditingPatientForVisit: false
        });
    }

    /**
     * Toggle visit edit mode
     */
    toggleVisitEditMode(): void {
        this.updateUIState({
            isEditingPatientForVisit: !this.uiState$.value.isEditingPatientForVisit
        });
    }

    /**
     * Toggle user menu
     */
    toggleUserMenu(): void {
        this.updateUIState({
            isUserMenuOpen: !this.uiState$.value.isUserMenuOpen
        });
    }

    /**
     * Close user menu
     */
    closeUserMenu(): void {
        this.updateUIState({ isUserMenuOpen: false });
    }

    /**
     * Reset all UI state to initial values
     */
    resetUIState(): void {
        this.uiState$.next(this.initialState);
    }

    /**
     * Private: Update specific UI state properties
     */
    private updateUIState(partial: Partial<UIState>): void {
        const current = this.uiState$.value;
        this.uiState$.next({ ...current, ...partial });
    }
}
