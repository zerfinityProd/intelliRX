import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { PatientService } from '../../services/patient';
import { UIStateService } from '../../services/uiStateService';
import { Patient } from '../../models/patient.model';
import { AddPatientComponent } from '../add-patient/add-patient';
import { AddVisitComponent } from '../add-visit/add-visit';
import { NavbarComponent } from '../navbar/navbar';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AddPatientComponent, AddVisitComponent, NavbarComponent],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit {
  searchTerm: string = '';
  searchResults: Patient[] = [];
  searchResults$: Observable<Patient[]>;
  errorMessage: string = '';
  isSearching: boolean = false;

  // Observables for template binding
  uiState$: Observable<any>;

  get hasMoreResults(): boolean { return this.patientService.hasMoreResults; }
  get isLoadingMore(): boolean { return this.patientService.isLoadingMore; }

  private searchTimeout: any;

  constructor(
    private patientService: PatientService,
    private uiStateService: UIStateService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.uiState$ = this.uiStateService.getUIState();
    this.searchResults$ = this.patientService.searchResults$;
  }

  ngOnInit(): void {
    this.clearSearch();
    // Subscribe to search results updates for local tracking
    this.patientService.searchResults$.subscribe(results => {
      this.searchResults = results;
      this.isSearching = false;
      this.cdr.markForCheck();
      console.log('✓ Search results updated:', results.length, 'patients');
    });
  }



  /**
   * Close user menu when clicking outside
   */
  /**
   * Handle search input with debounce
   */
  onSearchInput(): void {
    this.errorMessage = '';

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!this.searchTerm.trim()) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      this.cdr.markForCheck();
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.isSearching = true;
      this.performSearch(this.searchTerm.trim());
    }, 1000);
  }

  /**
   * Execute search for patients
   */
  private async performSearch(searchTerm: string): Promise<void> {
    if (!searchTerm) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      return;
    }

    try {
      console.log('🔍 Starting search for:', searchTerm);
      await this.patientService.searchPatients(searchTerm);

      if (this.searchResults.length === 0) {
        this.errorMessage = 'No patients found';
      } else {
        this.errorMessage = '';
      }
      this.isSearching = false;
    } catch (error) {
      this.errorMessage = 'Error searching for patients. Please try again.';
      this.isSearching = false;
      console.error('Search error:', error);
    }
  }

  /**
   * Trigger search immediately
   */
  async onSearch(): Promise<void> {
    if (!this.searchTerm.trim()) {
      this.patientService.clearSearchResults();
      return;
    }

    this.isSearching = true;
    await this.performSearch(this.searchTerm.trim());
  }

  /**
   * Open add patient form
   */
  openAddPatientForm(): void {
    this.uiStateService.openAddPatientForm();
  }

  /**
   * Close add patient form
   */
  closeAddPatientForm(): void {
    this.uiStateService.closeAddPatientForm();
  }

  /**
   * Handle patient added event
   */
  async onPatientAdded(patientId: string): Promise<void> {
    console.log('✓ Patient saved to Firebase:', patientId);
    this.uiStateService.closeAddPatientForm();

    // Wait for Firebase indexing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Refresh search if term exists
    if (this.searchTerm.trim()) {
      console.log('🔄 Refreshing search results...');
      await this.onSearch();
    } else {
      this.isSearching = true;
      await this.performSearch(this.searchTerm.trim() || '');
    }

    console.log('✓ Search refreshed, results count:', this.searchResults.length);
  }

  /**
   * Toggle floating action button
   */
  toggleFab(): void {
    this.uiStateService.toggleFab();
  }

  closeFab(): void {
    this.uiStateService.closeFab();
  }

  /**
   * Open add visit form for patient
   */
  openAddVisitForm(patient: Patient): void {
    this.uiStateService.openAddVisitForm(patient);
  }

  /**
   * Close add visit form
   */
  closeAddVisitForm(): void {
    this.uiStateService.closeAddVisitForm();
  }

  /**
   * Toggle visit edit mode
   */
  toggleVisitEditMode(): void {
    this.uiStateService.toggleVisitEditMode();
  }

  /**
   * Handle visit added event
   */
  async onVisitAdded(patientId: string): Promise<void> {
    console.log('✓ Visit added for patient:', patientId);
    this.closeAddVisitForm();
    if (this.searchTerm.trim()) {
      await this.onSearch();
    }
  }

  /**
   * Navigate to patient details
   */
  viewPatientDetails(patient: Patient): void {
    this.clearSearch();
    this.router.navigate(['/patient', patient.uniqueId]);
  }

  /**
   * Load more patient results for pagination
   */
  async loadMoreResults(): Promise<void> {
    await this.patientService.loadMorePatients();
  }

  /**
   * Clear search and reset state
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.errorMessage = '';
    this.isSearching = false;
    this.patientService.clearSearchResults();
  }


  /**
   * Format date for display
   */
  formatDate(date: Date | undefined | any): string {
    if (!date) return 'N/A';

    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }

    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}