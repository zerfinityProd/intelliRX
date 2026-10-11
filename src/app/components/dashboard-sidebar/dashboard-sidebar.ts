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
  // Performance optimization: Pre-indexed map by 'YYYY-M-D' date key for O(1) calendar cell lookups
  private apptsByDateMap = new Map<string, Appointment[]>();

  @Input() set appointments(value: Appointment[]) {
    this._appointments = value || [];
    this.updateApptsMap();
  }
  get appointments(): Appointment[] {
    return this._appointments;
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

  /** Pre-indexes appointments into a Map keyed by 'YYYY-M-D' in O(N) time */
  private updateApptsMap(): void {
    const map = new Map<string, Appointment[]>();
    for (const a of this._appointments) {
      if (!a.datetime) continue;
      const d = new Date(a.datetime);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push(a);
    }
    this.apptsByDateMap = map;
  }

  /** Performance optimization: O(1) map lookup instead of O(N) array filter per calendar cell */
  appointmentsOnDate(date: Date): Appointment[] {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return this.apptsByDateMap.get(key) || [];
  }
}
