import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Appointment } from '../../../models/appointment.model';

@Component({
  selector: 'app-rh-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rh-sidebar.html',
  styleUrl: './rh-sidebar.css',
  encapsulation: ViewEncapsulation.None
})
export class RhSidebarComponent {
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

  appointmentsOnDate(date: Date): Appointment[] {
    return this.appointments.filter(a => {
      const d = new Date(a.datetime);
      return d.getFullYear() === date.getFullYear()
        && d.getMonth() === date.getMonth()
        && d.getDate() === date.getDate();
    });
  }
}
