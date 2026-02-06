
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';
import { AddPatientComponent } from '../add-patient/add-patient';
import { PatientDetailsComponent } from '../patient-details/patient-details';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AddPatientComponent, PatientDetailsComponent],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnDestroy {
  currentUser: User | null = null;
  searchTerm: string = '';
  searchResults: Patient[] = [];
  isLoading: boolean = false;
  showAddPatientForm: boolean = false;
  showPatientDetails: boolean = false;
  selectedPatientForDetails: Patient | null = null;
  errorMessage: string = '';
  
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private patientService: PatientService,
    private router: Router
  ) {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
      });

    this.patientService.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        this.searchResults = results;
        this.isLoading = false;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSearch(): Promise<void> {
    this.errorMessage = '';
    
    if (!this.searchTerm.trim()) {
      this.errorMessage = 'Please enter a phone number or family ID';
      this.patientService.clearSearchResults();
      return;
    }

    this.isLoading = true;
    
    try {
      await this.patientService.searchPatients(this.searchTerm.trim());
      
      if (this.searchResults.length === 0) {
        this.errorMessage = 'No patients found';
      }
    } catch (error) {
      this.errorMessage = 'Error searching for patients. Please try again.';
      console.error('Search error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  openAddPatientForm(): void {
    this.showAddPatientForm = true;
  }

  closeAddPatientForm(): void {
    this.showAddPatientForm = false;
  }

  async onPatientAdded(patientId: string): Promise<void> {
    
    if (this.searchTerm.trim()) {
      await this.onSearch();
    }
  }

  viewPatientDetails(patient: Patient): void {
    this.selectedPatientForDetails = patient;
    this.showPatientDetails = true;
  }

  closePatientDetails(): void {
    this.showPatientDetails = false;
    this.selectedPatientForDetails = null;
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.errorMessage = '';
    this.patientService.clearSearchResults();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
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