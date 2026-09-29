import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Appointment } from '../../models/appointment.model';
import { UserPermissions } from '../../services/authorizationService';
import { BoardColumn } from '../../interfaces/board-column';

@Component({
  selector: 'app-reception-appointment-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reception-appointment-board.html',
  styleUrl: './reception-appointment-board.css',
  encapsulation: ViewEncapsulation.None
})
export class ReceptionAppointmentBoardComponent {
  // Toolbar inputs
  @Input() searchTerm: string = '';
  @Input() selectedDate: string = '';
  @Input() filterClinicId: string = '';
  @Input() filterDoctorId: string = '';
  @Input() clinicOptions: Array<{ id: string; label: string }> = [];
  @Input() doctorFilterOptions: Array<{ name: string; email: string }> = [];
  @Input() isSelectedToday: boolean = true;
  @Input() appointmentsDateMin: string = '';
  @Input() appointmentsDateMax: string = '';
  @Input() hasActiveFilters: boolean = false;

  // Board data
  @Input() columns: BoardColumn[] = [];

  private _filteredAppointments: Appointment[] = [];
  private cardsCache = new Map<Appointment['status'], Appointment[]>();

  // Performance optimization: Pre-group appointments by status whenever input array reference updates.
  // This avoids running O(N) array filtering 9+ times per change detection pass in templates.
  @Input()
  set filteredAppointments(value: Appointment[]) {
    this._filteredAppointments = value || [];
    this.updateCardsCache();
  }
  get filteredAppointments(): Appointment[] {
    return this._filteredAppointments;
  }

  private updateCardsCache(): void {
    const map = new Map<Appointment['status'], Appointment[]>();
    for (const appt of this._filteredAppointments) {
      const list = map.get(appt.status);
      if (list) {
        list.push(appt);
      } else {
        map.set(appt.status, [appt]);
      }
    }
    this.cardsCache = map;
  }

  @Input() isLoading: boolean = false;
  @Input() errorMessage: string = '';
  @Input() updatingId: string | null = null;
  @Input() permissions!: UserPermissions;

  // Drag state
  @Input() draggingAppt: Appointment | null = null;
  @Input() dragOverColumn: string | null = null;

  // Doctor name resolver - passed from parent
  @Input() doctorNameResolver: (appt: Appointment) => string = () => '';

  // Toolbar outputs
  @Output() searchTermChange = new EventEmitter<string>();
  @Output() selectedDateChange = new EventEmitter<string>();
  @Output() dateInputChanged = new EventEmitter<string>();
  @Output() filterClinicIdChange = new EventEmitter<string>();
  @Output() filterClinicChanged = new EventEmitter<void>();
  @Output() filterDoctorIdChange = new EventEmitter<string>();
  @Output() filterDoctorChanged = new EventEmitter<void>();
  @Output() clearFiltersClicked = new EventEmitter<void>();
  @Output() bookOnDateClicked = new EventEmitter<void>();
  @Output() goTodayClicked = new EventEmitter<void>();
  @Output() errorDismissed = new EventEmitter<void>();

  // Card action outputs
  @Output() openVisitClicked = new EventEmitter<Appointment>();
  @Output() openRescheduleClicked = new EventEmitter<Appointment>();
  @Output() openCancelClicked = new EventEmitter<Appointment>();

  // Drag outputs
  @Output() dragStarted = new EventEmitter<{ event: DragEvent; appt: Appointment }>();
  @Output() dragEnded = new EventEmitter<void>();
  @Output() columnDragOver = new EventEmitter<{ event: DragEvent; columnId: string }>();
  @Output() columnDragEnter = new EventEmitter<{ event: DragEvent; columnId: string }>();
  @Output() columnDragLeave = new EventEmitter<{ event: DragEvent; columnId: string }>();
  @Output() columnDrop = new EventEmitter<{ event: DragEvent; columnId: string }>();

  // Performance optimization: Returns stable array reference from pre-indexed Map in O(1) time
  cardsFor(status: Appointment['status']): Appointment[] {
    return this.cardsCache.get(status) || [];
  }

  isToday(datetime: any): boolean {
    const d = new Date(datetime);
    const t = new Date();
    return d.getFullYear() === t.getFullYear()
      && d.getMonth() === t.getMonth()
      && d.getDate() === t.getDate();
  }

  formatTime(datetime: any): string {
    const d = new Date(datetime);
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  getDoctorDisplayName(appt: Appointment): string {
    return this.doctorNameResolver(appt);
  }

  onDateInput(value: string): void {
    this.selectedDateChange.emit(value);
    this.dateInputChanged.emit(value);
  }

  onFilterClinicChange(value: string): void {
    this.filterClinicIdChange.emit(value);
    this.filterClinicChanged.emit();
  }

  onFilterDoctorChange(value: string): void {
    this.filterDoctorIdChange.emit(value);
    this.filterDoctorChanged.emit();
  }
}
