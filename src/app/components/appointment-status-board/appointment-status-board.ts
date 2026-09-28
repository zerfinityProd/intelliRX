import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, ViewEncapsulation, HostListener, OnChanges, OnInit, SimpleChanges } from '@angular/core';
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
export class AppointmentStatusBoardComponent implements OnChanges, OnInit {

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
  @Input() userRole: string = 'doctor';
  @Input() canCancel: boolean = false;
  @Input() canAddVisit: boolean = false;
  @Input() currentUserEmail: string = '';

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

  // ── Custom Calendar Dropdown ────────────────────────────────
  showCalendar = false;
  calYear = 0;
  calMonth = 0; // 0-indexed
  calDays: { day: number; dateStr: string; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean; isDisabled: boolean }[] = [];
  readonly weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  toggleCalendar(): void {
    this.showCalendar = !this.showCalendar;
    if (this.showCalendar) {
      // Initialize calendar to the currently selected date
      const d = this.selectedDate ? new Date(this.selectedDate + 'T00:00:00') : new Date();
      this.calYear = d.getFullYear();
      this.calMonth = d.getMonth();
      this.buildCalendar();
    }
  }

  calPrevMonth(): void {
    this.calMonth--;
    if (this.calMonth < 0) { this.calMonth = 11; this.calYear--; }
    this.buildCalendar();
  }

  calNextMonth(): void {
    this.calMonth++;
    if (this.calMonth > 11) { this.calMonth = 0; this.calYear++; }
    this.buildCalendar();
  }

  get calMonthLabel(): string {
    return new Date(this.calYear, this.calMonth, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  selectCalDate(day: { dateStr: string; isDisabled: boolean }): void {
    if (day.isDisabled) return;
    this.showCalendar = false;
    this.dateInputChanged.emit(day.dateStr);
  }

  calGoToday(): void {
    const today = new Date();
    this.calYear = today.getFullYear();
    this.calMonth = today.getMonth();
    this.buildCalendar();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    this.showCalendar = false;
    this.dateInputChanged.emit(`${y}-${m}-${d}`);
  }

  private buildCalendar(): void {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const firstDay = new Date(this.calYear, this.calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(this.calYear, this.calMonth, 0).getDate();

    this.calDays = [];

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const m = this.calMonth === 0 ? 12 : this.calMonth;
      const y = this.calMonth === 0 ? this.calYear - 1 : this.calYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      this.calDays.push({
        day, dateStr, isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === this.selectedDate,
        isDisabled: this.isDateOutOfRange(dateStr)
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this.calYear}-${String(this.calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      this.calDays.push({
        day, dateStr, isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === this.selectedDate,
        isDisabled: this.isDateOutOfRange(dateStr)
      });
    }

    // Next month leading days (fill to 42 cells = 6 rows)
    const remaining = 42 - this.calDays.length;
    for (let day = 1; day <= remaining; day++) {
      const m = this.calMonth === 11 ? 1 : this.calMonth + 2;
      const y = this.calMonth === 11 ? this.calYear + 1 : this.calYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      this.calDays.push({
        day, dateStr, isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === this.selectedDate,
        isDisabled: this.isDateOutOfRange(dateStr)
      });
    }
  }

  private isDateOutOfRange(dateStr: string): boolean {
    if (this.appointmentsDateMin && dateStr < this.appointmentsDateMin) return true;
    if (this.appointmentsDateMax && dateStr > this.appointmentsDateMax) return true;
    return false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.showCalendar) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.kb-date-nav__center') && !target.closest('.kb-cal-dropdown')) {
      this.showCalendar = false;
    }
  }

  // ── Performance Optimizations ──────────────────────────────
  /**
   * PERFORMANCE OPTIMIZATION:
   * Pre-aggregated map indexing appointments by status in O(N) when filteredAppointments
   * changes. Replaces repeated O(COLUMNS * APPOINTMENTS) array filter evaluations in templates
   * with O(1) stable reference lookups.
   */
  private cardsByStatusMap = new Map<string, Appointment[]>();

  /** Cached local date tuple to prevent allocating 'new Date()' on every card check in isToday */
  private todayY = 0;
  private todayM = 0;
  private todayD = 0;

  ngOnInit(): void {
    this.refreshTodayCache();
    this.updateCardsByStatus();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filteredAppointments'] || changes['columns']) {
      this.refreshTodayCache();
      this.updateCardsByStatus();
    }
  }

  private refreshTodayCache(): void {
    const t = new Date();
    this.todayY = t.getFullYear();
    this.todayM = t.getMonth();
    this.todayD = t.getDate();
  }

  private updateCardsByStatus(): void {
    const map = new Map<string, Appointment[]>();
    for (const col of this.columns) {
      map.set(col.id, []);
    }
    for (const appt of this.filteredAppointments || []) {
      const list = map.get(appt.status);
      if (list) {
        list.push(appt);
      } else {
        map.set(appt.status, [appt]);
      }
    }
    this.cardsByStatusMap = map;
  }

  cardsFor(status: Appointment['status']): Appointment[] {
    return this.cardsByStatusMap.get(status) || [];
  }

  isToday(datetime: any): boolean {
    if (!datetime) return false;
    const d = new Date(datetime);
    return d.getFullYear() === this.todayY
      && d.getMonth() === this.todayM
      && d.getDate() === this.todayD;
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

