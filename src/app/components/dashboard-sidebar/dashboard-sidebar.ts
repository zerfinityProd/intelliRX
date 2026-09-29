import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Appointment } from '../../models/appointment.model';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-sidebar.html',
  styleUrl: './dashboard-sidebar.css',
  encapsulation: ViewEncapsulation.None
})
export class DashboardSidebarComponent {
  @Input() calMonthLabel: string = '';
  @Input() calendarDays: (Date | null)[] = [];
  @Input() selectedCalDate: Date | null = null;
  @Input() scheduledCount: number = 0;
  @Input() completedTodayCount: number = 0;

  private _appointments: Appointment[] = [];
  private apptsByDateMap = new Map<string, Appointment[]>();

  // Performance optimization: Pre-index appointments by YYYY-MM-DD date key when input updates.
  // Prevents running O(N) date-parsing filters across 35–42 calendar cells (120+ calls per change detection cycle).
  @Input()
  set appointments(value: Appointment[]) {
    this._appointments = value || [];
    this.updateApptsByDateMap();
  }
  get appointments(): Appointment[] {
    return this._appointments;
  }

  private updateApptsByDateMap(): void {
    const map = new Map<string, Appointment[]>();
    for (const appt of this._appointments) {
      if (!appt.datetime) continue;
      const d = new Date(appt.datetime);
      if (isNaN(d.getTime())) continue;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      const list = map.get(key);
      if (list) {
        list.push(appt);
      } else {
        map.set(key, [appt]);
      }
    }
    this.apptsByDateMap = map;
  }

  @Output() prevMonthClicked = new EventEmitter<void>();
  @Output() nextMonthClicked = new EventEmitter<void>();
  @Output() calDayClicked = new EventEmitter<Date>();
  @Output() bookNewClicked = new EventEmitter<void>();
  @Output() goTodayClicked = new EventEmitter<void>();

  isToday(date: Date): boolean {
    const t = new Date();
    return date.getFullYear() === t.getFullYear()
      && date.getMonth() === t.getMonth()
      && date.getDate() === t.getDate();
  }

  isCalSelected(date: Date): boolean {
    if (!this.selectedCalDate) return false;
    return date.getFullYear() === this.selectedCalDate.getFullYear()
      && date.getMonth() === this.selectedCalDate.getMonth()
      && date.getDate() === this.selectedCalDate.getDate();
  }

  // Performance optimization: O(1) date map lookup returning pre-filtered appointments
  appointmentsOnDate(date: Date): Appointment[] {
    if (!date) return [];
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    return this.apptsByDateMap.get(key) || [];
  }
}
