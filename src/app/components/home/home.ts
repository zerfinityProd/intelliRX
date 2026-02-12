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
    // Subscribe to current user
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.ngZone.run(() => {
          this.currentUser = user;
          this.cdr.detectChanges();
        });
      });

    // Subscribe to search results
    this.patientService.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        this.ngZone.run(() => {
          this.searchResults = results;
          this.isSearching = false;
          console.log('✔️ Search results updated:', results.length, 'patients');
          this.cdr.detectChanges();
        });
      });
  }

  ngOnInit(): void {
    this.clearSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  onSearchInput(): void {
    this.errorMessage = '';
    
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    
    if (!this.searchTerm.trim()) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      this.cdr.detectChanges();
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        this.isSearching = true;
        this.cdr.detectChanges();
      });
      this.performSearch(this.searchTerm.trim());
    }, 1000);
  }

  private async performSearch(searchTerm: string): Promise<void> {
    if (!searchTerm) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      console.log('🔎 Starting search for:', searchTerm);
      await this.patientService.searchPatients(searchTerm);
      
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
    console.log('✅ Patient saved to Firebase:', patientId);
    
    // Wait a bit for Firebase to index the new patient
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Always refresh search if there's a search term
    if (this.searchTerm.trim()) {
      console.log('🔄 Refreshing search results...');
      await this.onSearch();
    } else {
      // If no search term, trigger a search with the new patient's phone
      // This is helpful to show the newly added patient
      this.isSearching = true;
      this.cdr.detectChanges();
      await this.performSearch(this.searchTerm.trim() || '');
    }
    
    console.log('✅ Search refreshed, results count:', this.searchResults.length);
  }

  viewPatientDetails(patient: Patient): void {
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

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

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