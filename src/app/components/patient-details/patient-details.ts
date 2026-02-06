
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Patient, Visit } from '../../models/patient.model';
import { PatientService } from '../../services/patient';

@Component({
  selector: 'app-patient-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-details.html',
  styleUrl: './patient-details.css'
})
export class PatientDetailsComponent implements OnInit {
  @Input() patient!: Patient;
  @Output() close = new EventEmitter<void>();

  visits: Visit[] = [];
  isLoadingVisits: boolean = false;
  activeTab: 'info' | 'visits' = 'info';

  constructor(private patientService: PatientService) {}

  async ngOnInit(): Promise<void> {
    await this.loadVisits();
  }

  async loadVisits(): Promise<void> {
    if (!this.patient || !this.patient.uniqueId) return;
    
    this.isLoadingVisits = true;
    try {
      this.visits = await this.patientService.getPatientVisits(this.patient.uniqueId);
    } catch (error) {
      console.error('Error loading visits:', error);
    } finally {
      this.isLoadingVisits = false;
    }
  }

  onClose(): void {
    this.close.emit();
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
    this.activeTab = tab;
  }
}