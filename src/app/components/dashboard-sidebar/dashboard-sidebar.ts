import { Component, Input, Output, EventEmitter, ViewEncapsulation, OnChanges, OnInit, SimpleChanges } from '@angular/core';
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
export class DashboardSidebarComponent implements OnChanges, OnInit {
  @Input() calMonthLabel: string = '';
  @Input() calendarDays: (Date | null)[] = [];
  @Input() selectedCalDate: Date | null = null;
  @Input() scheduledCount: number = 0;
  @Input() completedTodayCount: number = 0;
  @Input() appointments: Appointment[] = [];

  @Output() prevMonthClicked = new EventEmitter<void>();
  @Output() nextMonthClicked = new EventEmitter<void>();
  @Output() calDayClicked = new EventEmitter<Date>();
  @Output() bookNewClicked = new EventEmitter<void>();
  @Output() goTodayClicked = new EventEmitter<void>();

  // Performance optimization: Pre-indexed map of appointments grouped by date key ("YYYY-M-D").
  // Avoids executing O(N) array filtering with Date parsing for each calendar day cell on every Angular change detection pass.
  private apptListMap = new Map<string, Appointment[]>();

  ngOnInit(): void {
    this.rebuildApptListMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appointments']) {
      this.rebuildApptListMap();
    }
  }

  /**
   * Rebuilds the date-keyed appointment map from the input appointments array.
   * Runs in O(N) time once when appointments input changes.
   */
  private rebuildApptListMap(): void {
    this.apptListMap.clear();
    const appts = this.appointments || [];
    for (let i = 0; i < appts.length; i++) {
      const appt = appts[i];
      if (!appt || !appt.datetime) continue;
      const d = new Date(appt.datetime);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      let list = this.apptListMap.get(key);
      if (!list) {
        list = [];
        this.apptListMap.set(key, list);
      }
      list.push(appt);
    }
  }

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

  /**
   * Returns appointment count for a given Date in O(1) time using pre-indexed lookup map.
   */
  getAppointmentCount(date: Date): number {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    return this.apptListMap.get(key)?.length || 0;
  }

  /**
   * Checks whether a date has any appointments in O(1) time.
   */
  hasAppointments(date: Date): boolean {
    return this.getAppointmentCount(date) > 0;
  }

  /**
   * Returns appointments for a given Date in O(1) time.
   */
  appointmentsOnDate(date: Date): Appointment[] {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    return this.apptListMap.get(key) || [];
  }
}
