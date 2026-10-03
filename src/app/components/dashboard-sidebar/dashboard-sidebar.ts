import { Component, Input, Output, EventEmitter, ViewEncapsulation, OnChanges, SimpleChanges } from '@angular/core';
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
export class DashboardSidebarComponent implements OnChanges {
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

  /**
   * Pre-indexed map of appointments keyed by 'YYYY-MM-DD' date string.
   * Allows O(1) lookup per calendar day cell during template execution instead of O(N) array filter.
   */
  private appointmentsByDateMap = new Map<string, Appointment[]>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appointments']) {
      this.rebuildAppointmentsByDateMap();
    }
  }

  /**
   * Rebuilds the date-indexed map for O(1) appointment lookups per calendar grid cell.
   * Reduces render-time complexity from O(CELLS * APPOINTMENTS) to O(APPOINTMENTS).
   */
  private rebuildAppointmentsByDateMap(): void {
    const map = new Map<string, Appointment[]>();
    for (const appt of this.appointments || []) {
      if (!appt.datetime) continue;
      const d = new Date(appt.datetime);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const list = map.get(key);
      if (list) {
        list.push(appt);
      } else {
        map.set(key, [appt]);
      }
    }
    this.appointmentsByDateMap = map;
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
   * Returns appointments for a specific date using O(1) Map lookup.
   * Optimization: Avoids parsing dates and scanning the full appointment list repeatedly during template rendering.
   */
  appointmentsOnDate(date: Date): Appointment[] {
    if (!date) return [];
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return this.appointmentsByDateMap.get(key) || [];
  }
}
