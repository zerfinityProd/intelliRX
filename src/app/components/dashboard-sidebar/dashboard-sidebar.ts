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

  // Map of YYYY-M-D -> Appointment[] for O(1) lookups during calendar grid rendering
  private appointmentsByDateMap = new Map<string, Appointment[]>();

  ngOnInit(): void {
    this.rebuildAppointmentsMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appointments']) {
      this.rebuildAppointmentsMap();
    }
  }

  // Pre-indexes appointments by date key (YYYY-M-D) to avoid O(CELLS * APPOINTMENTS)
  // timestamp parsing on every Angular change detection pass.
  private rebuildAppointmentsMap(): void {
    this.appointmentsByDateMap.clear();
    if (!this.appointments) return;

    for (const a of this.appointments) {
      if (!a.datetime) continue;
      const d = new Date(a.datetime);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      let list = this.appointmentsByDateMap.get(key);
      if (!list) {
        list = [];
        this.appointmentsByDateMap.set(key, list);
      }
      list.push(a);
    }
  }

  private getDateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
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

  // Returns count of appointments on a given date using O(1) map lookup
  getAppointmentCount(date: Date): number {
    const list = this.appointmentsByDateMap.get(this.getDateKey(date));
    return list ? list.length : 0;
  }

  // Returns list of appointments on a given date using O(1) map lookup
  appointmentsOnDate(date: Date): Appointment[] {
    return this.appointmentsByDateMap.get(this.getDateKey(date)) || [];
  }
}
