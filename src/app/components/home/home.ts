import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';
import { AddPatientComponent } from '../add-patient/add-patient';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AddPatientComponent],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  searchTerm: string = '';
  searchResults: Patient[] = [];
  showAddPatientForm: boolean = false;
  errorMessage: string = '';
  isSearching: boolean = false;
  
  private destroy$ = new Subject<void>();
  private searchTimeout: any;

  constructor(
    private authService: AuthService,
    private patientService: PatientService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    // Subscribe to current user with change detection
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.ngZone.run(() => {
          this.currentUser = user;
          this.cdr.detectChanges();
        });
      });

    // Subscribe to search results with change detection
    this.patientService.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        this.ngZone.run(() => {
          this.searchResults = results;
          this.isSearching = false;
          console.log('Ã¢Å“â€¦ Search results updated:', results.length, 'patients');
          this.cdr.detectChanges();
        });
      });
  }

  ngOnInit(): void {
    // Clear any previous search results when component loads
    this.clearSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  /**
   * Called on every keystroke in search input - with debounce for performance
   */
  onSearchInput(): void {
    this.errorMessage = '';
    
    // Clear any existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    
    // If search term is empty, clear results immediately
    if (!this.searchTerm.trim()) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      this.cdr.detectChanges();
      return;
    }

    // Ã¢Å“â€¦ CHANGED: Don't set loading state immediately - wait for debounce
    // Debounce search by 1000ms (1 second) - only search when user stops typing
    this.searchTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        this.isSearching = true;
        this.cdr.detectChanges();
      });
      this.performSearch(this.searchTerm.trim());
    }, 1000); // Changed from 300ms to 1000ms
  }

  /**
   * Perform the actual search with proper error handling
   */
  private async performSearch(searchTerm: string): Promise<void> {
    if (!searchTerm) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      console.log('Ã°Å¸â€Â Starting search for:', searchTerm);
      await this.patientService.searchPatients(searchTerm);
      
      // Check results in the next tick to ensure subscription has updated
      this.ngZone.run(() => {
        if (this.searchResults.length === 0) {
          this.errorMessage = 'No patients found';
        } else {
          this.errorMessage = '';
        }
        this.isSearching = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      this.ngZone.run(() => {
        this.errorMessage = 'Error searching for patients. Please try again.';
        this.isSearching = false;
        console.error('Search error:', error);
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Legacy method - kept for backward compatibility
   */
  async onSearch(): Promise<void> {
    if (!this.searchTerm.trim()) {
      this.patientService.clearSearchResults();
      return;
    }
    
    this.isSearching = true;
    this.cdr.detectChanges();
    await this.performSearch(this.searchTerm.trim());
  }

  openAddPatientForm(): void {
    this.showAddPatientForm = true;
    this.cdr.detectChanges();
  }

  closeAddPatientForm(): void {
    this.showAddPatientForm = false;
    this.cdr.detectChanges();
  }

  async onPatientAdded(patientId: string): Promise<void> {
    console.log('Ã¢Å“â€¦ Patient added:', patientId);
    
    // Refresh search results if there's an active search
    if (this.searchTerm.trim()) {
      await this.onSearch();
    }
  }

  /**
   * View patient details
   */
  viewPatientDetails(patient: Patient): void {
    // Clear search before navigating
    this.clearSearch();
    this.router.navigate(['/patient', patient.uniqueId]);
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.errorMessage = '';
    this.isSearching = false;
    this.patientService.clearSearchResults();
    this.cdr.detectChanges();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  // Format date for display
  formatDate(date: Date | undefined | any): string {
    if (!date) return 'N/A';
    
    // Handle Firestore Timestamp objects
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