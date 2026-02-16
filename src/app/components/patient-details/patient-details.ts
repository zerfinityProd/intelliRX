import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Patient, Visit } from '../../models/patient.model';
import { PatientService } from '../../services/patient';
import { AddPatientComponent } from '../add-patient/add-patient';
import { PatientStatsComponent } from '../patient-stats/patient-stats';
import { EditPatientInfoComponent } from '../edit-patient-info/edit-patient-info';

@Component({
  selector: 'app-patient-details',
  standalone: true,
  imports: [CommonModule, AddPatientComponent, PatientStatsComponent, EditPatientInfoComponent],
  templateUrl: './patient-details.html',
  styleUrl: './patient-details.css'
})
export class PatientDetailsComponent implements OnInit {
  patient: Patient | null = null;
  visits: Visit[] = [];
  isLoadingPatient: boolean = true;
  isLoadingVisits: boolean = false;
  activeTab: 'info' | 'visits' = 'info';
  errorMessage: string = '';
  
  // Properties for visit form
  showAddVisitForm: boolean = false;
  isEditingPatient: boolean = false;
  
  // Property for edit patient info modal
  showEditPatientInfo: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private patientService: PatientService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit(): Promise<void> {
    const patientId = this.route.snapshot.paramMap.get('id');
    
    console.log('ðŸ” Patient Details - Loading patient:', patientId);
    
    if (!patientId) {
      this.ngZone.run(() => {
        this.errorMessage = 'Invalid patient ID';
        this.isLoadingPatient = false;
        this.cdr.detectChanges();
      });
      return;
    }

    await this.loadPatient(patientId);
  }

  async loadPatient(patientId: string): Promise<void> {
    this.ngZone.run(() => {
      this.isLoadingPatient = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
    });
    
    try {
      console.log('ðŸ“¡ Fetching patient from service...');
      this.patient = await this.patientService.getPatient(patientId);
      
      console.log('âœ… Patient data received:', this.patient ? 'Success' : 'Not found');
      
      this.ngZone.run(() => {
        if (!this.patient) {
          this.errorMessage = 'Patient not found';
          this.isLoadingPatient = false;
          this.cdr.detectChanges();
          return;
        }
        
        this.isLoadingPatient = false;
        this.cdr.detectChanges();
        
        // Load visits after patient is loaded
        this.loadVisits();
      });
    } catch (error) {
      console.error('âŒ Error loading patient:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'Error loading patient details';
        this.isLoadingPatient = false;
        this.cdr.detectChanges();
      });
    }
  }

  async loadVisits(): Promise<void> {
    if (!this.patient || !this.patient.uniqueId) return;
    
    this.ngZone.run(() => {
      this.isLoadingVisits = true;
      this.cdr.detectChanges();
    });
    
    try {
      console.log('ðŸ“¡ Fetching visits...');
      this.visits = await this.patientService.getPatientVisits(this.patient.uniqueId);
      console.log('âœ… Visits loaded:', this.visits.length);
      
      this.ngZone.run(() => {
        this.isLoadingVisits = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('âŒ Error loading visits:', error);
      this.ngZone.run(() => {
        this.isLoadingVisits = false;
        this.cdr.detectChanges();
      });
    }
  }

  // Open visit form with patient data pre-filled
  openAddVisitForm(): void {
    this.ngZone.run(() => {
      this.showAddVisitForm = true;
      this.isEditingPatient = false; // Start with locked fields
      this.cdr.detectChanges();
    });
  }

  // Open separate modal to edit patient information
  openEditPatientInfo(): void {
    this.ngZone.run(() => {
      this.showEditPatientInfo = true;
      this.cdr.detectChanges();
    });
  }

  // Close edit patient info modal
  closeEditPatientInfo(): void {
    this.ngZone.run(() => {
      this.showEditPatientInfo = false;
      this.cdr.detectChanges();
    });
  }

  // Handle patient info updated
  async onPatientInfoUpdated(patientId: string): Promise<void> {
    console.log('âœ… Patient info updated:', patientId);
    
    // Reload patient data
    await this.loadPatient(patientId);
    
    // Close the edit modal
    this.closeEditPatientInfo();
  }

  // Close visit form
  closeAddVisitForm(): void {
    this.ngZone.run(() => {
      this.showAddVisitForm = false;
      this.isEditingPatient = false;
      this.cdr.detectChanges();
    });
  }

  // Toggle edit mode for patient fields
  toggleEditMode(): void {
    this.ngZone.run(() => {
      this.isEditingPatient = !this.isEditingPatient;
      this.cdr.detectChanges();
    });
  }

  // Handle visit added - reload data
  async onVisitAdded(patientId: string): Promise<void> {
    console.log('âœ… Visit added:', patientId);
    
    // Reload patient data (in case it was edited)
    await this.loadPatient(patientId);
    
    // Reload visits to show the new one
    await this.loadVisits();
    
    // Switch to visits tab to show the new visit
    this.setActiveTab('visits');
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  formatDate(date: Date | undefined | any): string {
    if (!date) return 'N/A';
    
    // Handle Firestore Timestamp objects
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(date: Date | undefined | any): string {
    if (!date) return 'N/A';
    
    // Handle Firestore Timestamp objects
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  setActiveTab(tab: 'info' | 'visits'): void {
    this.ngZone.run(() => {
      this.activeTab = tab;
      this.cdr.detectChanges();
    });
  }
}