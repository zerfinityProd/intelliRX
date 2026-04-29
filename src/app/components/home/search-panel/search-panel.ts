import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { Patient } from '../../../models/patient.model';
import { UserPermissions } from '../../../services/authorizationService';
import { MomentDatePipe } from '../../../pipes/moment-date.pipe';

@Component({
  selector: 'app-search-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MomentDatePipe],
  templateUrl: './search-panel.html',
  styleUrl: './search-panel.css',
  encapsulation: ViewEncapsulation.None
})
export class SearchPanelComponent {
  @Input() searchTerm: string = '';
  @Input() searchResults: Patient[] = [];
  @Input() isSearching: boolean = false;
  @Input() errorMessage: string = '';
  @Input() hasMoreResults: boolean = false;
  @Input() isLoadingMore: boolean = false;
  @Input() permissions!: UserPermissions;

  @Output() searchTermChange = new EventEmitter<string>();
  @Output() searchInputChanged = new EventEmitter<void>();
  @Output() clearSearchClicked = new EventEmitter<void>();
  @Output() loadMoreClicked = new EventEmitter<void>();
  @Output() addPatientClicked = new EventEmitter<void>();
  @Output() viewPatientClicked = new EventEmitter<Patient>();
  @Output() addVisitClicked = new EventEmitter<Patient>();
  @Output() addAppointmentClicked = new EventEmitter<Patient>();

  onSearchInput(): void {
    this.searchInputChanged.emit();
  }

  onSearchTermChange(value: string): void {
    this.searchTermChange.emit(value);
  }

  clearSearch(): void {
    this.clearSearchClicked.emit();
  }

  loadMore(): void {
    this.loadMoreClicked.emit();
  }

  openAddPatientForm(): void {
    this.addPatientClicked.emit();
  }

  viewPatientDetails(patient: Patient): void {
    this.viewPatientClicked.emit(patient);
  }

  openAddVisitForm(patient: Patient): void {
    this.addVisitClicked.emit(patient);
  }

  openAddAppointmentForm(patient: Patient): void {
    this.addAppointmentClicked.emit(patient);
  }
}
