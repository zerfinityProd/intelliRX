import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

@Component({
  selector: 'app-appointment-status-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './appointment-status-board.html',
  styleUrl: './appointment-status-board.css',
  encapsulation: ViewEncapsulation.None
})
export class AppointmentStatusBoardComponent {
  @ViewChild('dateInputEl') dateInputEl!: ElementRef<HTMLInputElement>;

  // Header data
  @Input() searchTerm: string = '';
  @Input() selectedDate: string = '';
  @Input() selectedDateLabel: string = '';
  @Input() appointmentsDateMin: string = '';
  @Input() appointmentsDateMax: string = '';
  @Input() canAppointment: boolean = false;

  // Board data
  @Input() columns: BoardColumn[] = [];
  @Input() filteredAppointments: Appointment[] = [];
  @Input() isLoading: boolean = false;
  @Input() errorMessage: string = '';
  @Input() updatingId: string | null = null;
  @Input() userRole: 'doctor' | 'receptionist' = 'doctor';
  @Input() canCancel: boolean = false;

  // Drag state
  @Input() draggingAppt: Appointment | null = null;
  @Input() dragOverColumn: string | null = null;

  // Doctor name resolver
  @Input() doctorNameResolver: (appt: Appointment) => string = () => '';

  // Header outputs
  @Output() searchTermChange = new EventEmitter<string>();
  @Output() dateInputChanged = new EventEmitter<string>();
  @Output() goToPrevDateClicked = new EventEmitter<void>();
  @Output() goToNextDateClicked = new EventEmitter<void>();
  @Output() bookNewClicked = new EventEmitter<void>();
  @Output() errorDismissed = new EventEmitter<void>();

  // Card action outputs
  @Output() openVisitClicked = new EventEmitter<Appointment>();
  @Output() openPostponeClicked = new EventEmitter<Appointment>();
  @Output() openCancelClicked = new EventEmitter<Appointment>();

  // Drag outputs
  @Output() dragStarted = new EventEmitter<{ event: DragEvent; appt: Appointment }>();
  @Output() dragEnded = new EventEmitter<void>();
  @Output() columnDragOver = new EventEmitter<{ event: DragEvent; columnId: string }>();
  @Output() columnDragEnter = new EventEmitter<{ event: DragEvent; columnId: string }>();
  @Output() columnDragLeave = new EventEmitter<{ event: DragEvent; columnId: string }>();
  @Output() columnDrop = new EventEmitter<{ event: DragEvent; columnId: string }>();

  cardsFor(status: Appointment['status']): Appointment[] {
    return this.filteredAppointments.filter(a => a.status === status);
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
}
