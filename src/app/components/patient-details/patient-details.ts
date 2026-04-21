import { Component, OnInit, ChangeDetectorRef, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { Patient, Visit } from '../../models/patient.model';
import { PatientService } from '../../services/patient';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService, UserPermissions } from '../../services/authorizationService';
import { PatientStatsComponent } from '../patient-stats/patient-stats';
import { EditPatientInfoComponent } from '../edit-patient-info/edit-patient-info';
import { NavbarComponent } from '../navbar/navbar';
import moment from 'moment';

@Component({
  selector: 'app-patient-details',
  standalone: true,
  imports: [CommonModule, FormsModule, PatientStatsComponent, EditPatientInfoComponent, NavbarComponent],
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

  // Property for edit patient info modal
  showEditPatientInfo: boolean = false;

  // Delete confirmation state
  showDeleteVisitConfirm: boolean = false;
  showDeletePatientConfirm: boolean = false;
  visitToDelete: Visit | null = null;
  isDeletingVisit: boolean = false;
  isDeletingPatient: boolean = false;

  // Permissions — driven by Firestore layered resolution (per-user → subscription → default)
  permissions: UserPermissions = {
    canDelete: false, canEdit: false, canAddPatient: false,
    canAddVisit: false, canAppointment: false, canCancel: false,
    canEditVisit: false,
  };

  /** Convenience getter for template backward compatibility */
  get canDelete(): boolean { return this.permissions.canDelete; }

  // Expand Visit state
  expandedVisitId: string | null = null;

  // Edit Visit state
  editingVisit: Visit | null = null;
  editVisitData: Partial<Visit> = {};
  isSavingVisitEdit = false;
  editVisitError = '';

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patientService = inject(PatientService);
  private readonly authService = inject(AuthenticationService);
  private readonly authorizationService = inject(AuthorizationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  async ngOnInit(): Promise<void> {
    // Fetch all permissions from Firestore (layered resolution)
    const email = this.authService.currentUserValue?.email || '';
    this.permissions = await this.authorizationService.getUserPermissions(email);

    // Check if navigation state specifies which tab to show (e.g. after adding a visit)
    const navState = history.state as { activeTab?: string } | undefined;
    if (navState?.activeTab === 'visits') {
      this.activeTab = 'visits';
    }

    const patientId = this.route.snapshot.paramMap.get('id');

    console.log('🔍 Patient Details - Loading patient:', patientId);

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
      console.log('📡 Fetching patient from service...');
      this.patient = await this.patientService.getPatient(patientId);

      console.log('✅ Patient data received:', this.patient ? 'Success' : 'Not found');

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
      console.error('❌ Error loading patient:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'Error loading patient details';
        this.isLoadingPatient = false;
        this.cdr.detectChanges();
      });
    }
  }

  async loadVisits(): Promise<void> {
    if (!this.patient || !this.patient.id) return;

    this.ngZone.run(() => {
      this.isLoadingVisits = true;
      this.cdr.detectChanges();
    });

    try {
      console.log('📡 Fetching visits...');
      let allVisits = await this.patientService.getPatientVisits(this.patient.id!);

      // Doctor visit isolation: doctors only see their own visits
      const currentUser = this.authService.currentUserValue;
      if (currentUser?.role === 'doctor' && currentUser?.email) {
        const doctorEmail = currentUser.email.trim().toLowerCase();
        allVisits = allVisits.filter(v =>
          !v.doctor_id || v.doctor_id.trim().toLowerCase() === doctorEmail
        );
      }

      this.visits = allVisits;
      console.log('✅ Visits loaded:', this.visits.length);

      this.ngZone.run(() => {
        this.isLoadingVisits = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('❌ Error loading visits:', error);
      this.ngZone.run(() => {
        this.isLoadingVisits = false;
        this.cdr.detectChanges();
      });
    }
  }

  // Navigate to the dedicated Add Visit page
  openAddVisitForm(): void {
    if (this.patient) {
      this.router.navigate(['/patient', this.patient.id, 'add-visit'], { state: { origin: 'patient' } });
    }
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
    console.log('✅ Patient info updated:', patientId);

    // Reload patient data
    await this.loadPatient(patientId);

    // Close the edit modal
    this.closeEditPatientInfo();
  }

  // Delete Visit
  confirmDeleteVisit(visit: Visit): void {
    this.ngZone.run(() => {
      this.visitToDelete = visit;
      this.showDeleteVisitConfirm = true;
      this.cdr.detectChanges();
    });
  }

  cancelDeleteVisit(): void {
    this.ngZone.run(() => {
      this.visitToDelete = null;
      this.showDeleteVisitConfirm = false;
      this.cdr.detectChanges();
    });
  }

  async executeDeleteVisit(): Promise<void> {
    if (!this.visitToDelete || !this.patient) return;
    this.isDeletingVisit = true;
    try {
      await this.patientService.deleteVisit(this.patient.id!, this.visitToDelete.id!);
      this.cancelDeleteVisit();
      await this.loadVisits();
    } catch (error) {
      console.error('Error deleting visit:', error);
    } finally {
      this.ngZone.run(() => {
        this.isDeletingVisit = false;
        this.cdr.detectChanges();
      });
    }
  }

  // Delete Patient
  confirmDeletePatient(): void {
    this.ngZone.run(() => {
      this.showDeletePatientConfirm = true;
      this.cdr.detectChanges();
    });
  }

  cancelDeletePatient(): void {
    this.ngZone.run(() => {
      this.showDeletePatientConfirm = false;
      this.cdr.detectChanges();
    });
  }

  async executeDeletePatient(): Promise<void> {
    if (!this.patient) return;
    this.isDeletingPatient = true;
    try {
      await this.patientService.deletePatient(this.patient.id!);
      this.router.navigate(['/home']);
    } catch (error) {
      console.error('Error deleting patient:', error);
      this.ngZone.run(() => {
        this.isDeletingPatient = false;
        this.cdr.detectChanges();
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  // ── Edit Visit ──
  startEditVisit(visit: Visit): void {
    if (!this.patient) return;
    this.router.navigate(['/patient', this.patient.id, 'add-visit'], {
      state: {
        origin: 'patient',
        editVisitId: visit.id,
        editVisitData: visit
      }
    });
  }

  cancelEditVisit(): void {
    this.editingVisit = null;
    this.editVisitData = {};
    this.editVisitError = '';
    this.cdr.detectChanges();
  }

  async saveEditVisit(): Promise<void> {
    if (!this.editingVisit?.id || !this.patient?.id) return;
    if (!(this.editVisitData.chiefComplaints || '').trim()) {
      this.editVisitError = 'Chief complaints is required.';
      this.cdr.detectChanges();
      return;
    }
    this.isSavingVisitEdit = true;
    this.editVisitError = '';
    this.cdr.detectChanges();
    try {
      const now = new Date().toISOString();
      const dataToSave = { ...this.editVisitData, updated_at: now };
      await this.patientService.updateVisit(this.patient.id, this.editingVisit.id, dataToSave);
      // Reflect changes in the local visits array
      const idx = this.visits.findIndex(v => v.id === this.editingVisit!.id);
      if (idx !== -1) {
        Object.assign(this.visits[idx], dataToSave);
      }
      this.cancelEditVisit();
    } catch {
      this.editVisitError = 'Failed to save changes. Please try again.';
    } finally {
      this.isSavingVisitEdit = false;
      this.cdr.detectChanges();
    }
  }

  formatDate(date: Date | undefined | any): string {
    if (!date) return 'N/A';
    if (date && typeof date.toDate === 'function') date = date.toDate();
    const m = moment(date);
    return m.isValid() ? m.format('DD MMMM YYYY') : 'N/A';
  }

  formatDateTime(date: Date | undefined | any): string {
    if (!date) return 'N/A';
    if (date && typeof date.toDate === 'function') date = date.toDate();
    const m = moment(date);
    return m.isValid() ? m.format('DD MMM YYYY, hh:mm A') : 'N/A';
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  calculateAge(dob: Date | undefined | any): string {
    if (!dob) return '';
    if (dob && typeof dob.toDate === 'function') {
      dob = dob.toDate();
    }
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? `${age} yrs` : '';
  }

  setActiveTab(tab: 'info' | 'visits'): void {
    this.ngZone.run(() => {
      this.activeTab = tab;
      this.cdr.detectChanges();
    });
  }

  toggleVisitExpand(visitId: string): void {
    this.ngZone.run(() => {
      this.expandedVisitId = this.expandedVisitId === visitId ? null : visitId;
      this.cdr.detectChanges();
    });
  }
}