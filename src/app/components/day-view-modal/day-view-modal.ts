import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Appointment } from '../../models/appointment.model';

export interface DayViewSlot {
  time: string;       // "09:00", "09:30", etc.
  label: string;      // "9:00 AM"
  isHourStart: boolean;
  isBooked: boolean;
  isPast: boolean;
  appointment: Appointment | null;
}

@Component({
  selector: 'app-day-view-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './day-view-modal.html',
  styleUrl: './day-view-modal.css'
})
export class DayViewModalComponent implements OnChanges {
  @Input() date!: Date;
  @Input() appointments: Appointment[] = [];
  @Input() allTimeSlots: string[] = [];
  @Input() bookedSlots: string[] = [];
  @Input() isLoading = false;
  @Input() isPastDate = false;
  @Input() userRole: 'doctor' | 'receptionist' = 'doctor';
  @Input() doctorName = '';

  @Output() closeModal = new EventEmitter<void>();
  @Output() bookSlot = new EventEmitter<string>();
  @Output() addVisit = new EventEmitter<Appointment>();
  @Output() rescheduleAppt = new EventEmitter<Appointment>();
  @Output() cancelAppt = new EventEmitter<Appointment>();

  slots: DayViewSlot[] = [];
  currentTimePercent = -1; // -1 = don't show indicator

  get dateLabel(): string {
    if (!this.date) return '';
    return this.date.toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  get scheduledCount(): number {
    return this.appointments.filter(a => a.status === 'scheduled').length;
  }

  get completedCount(): number {
    return this.appointments.filter(a => a.status === 'completed').length;
  }

  get cancelledCount(): number {
    return this.appointments.filter(a => a.status === 'cancelled').length;
  }

  get totalCount(): number {
    return this.appointments.length;
  }

  get freeSlotCount(): number {
    return this.slots.filter(s => !s.isBooked && !s.isPast).length;
  }

  get isToday(): boolean {
    if (!this.date) return false;
    const now = new Date();
    return this.date.getFullYear() === now.getFullYear()
      && this.date.getMonth() === now.getMonth()
      && this.date.getDate() === now.getDate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.buildSlots();
    this.computeCurrentTimeIndicator();
  }

  private buildSlots(): void {
    if (!this.allTimeSlots || this.allTimeSlots.length === 0) {
      this.slots = [];
      return;
    }

    // Build a map of appointmentTime -> Appointment for quick lookup
    const apptMap = new Map<string, Appointment>();
    for (const appt of this.appointments) {
      if (appt.appointmentTime) {
        // For multiple appointments at same time, first one wins (scheduled > others)
        const existing = apptMap.get(appt.appointmentTime);
        if (!existing || (appt.status === 'scheduled' && existing.status !== 'scheduled')) {
          apptMap.set(appt.appointmentTime, appt);
        }
      }
    }

    this.slots = this.allTimeSlots.map(time => {
      const [h, m] = time.split(':').map(Number);
      const isHourStart = m === 0;
      const isBooked = this.bookedSlots.includes(time);
      const isPast = this.isSlotInPast(time);
      const appointment = apptMap.get(time) || null;

      return {
        time,
        label: this.formatTimeLabel(h, m),
        isHourStart,
        isBooked,
        isPast,
        appointment
      };
    });
  }

  private isSlotInPast(slot: string): boolean {
    if (this.isPastDate) return true;
    if (!this.isToday) return false;
    const now = new Date();
    const [h, m] = slot.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return slotMinutes <= nowMinutes;
  }

  private computeCurrentTimeIndicator(): void {
    if (!this.isToday || !this.allTimeSlots.length) {
      this.currentTimePercent = -1;
      return;
    }
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Get the start and end minutes from the time slots
    const firstSlot = this.allTimeSlots[0];
    const lastSlot = this.allTimeSlots[this.allTimeSlots.length - 1];
    const [fH, fM] = firstSlot.split(':').map(Number);
    const [lH, lM] = lastSlot.split(':').map(Number);
    const startMin = fH * 60 + fM;
    const endMin = lH * 60 + lM + 30; // last slot + duration

    if (nowMinutes < startMin || nowMinutes > endMin) {
      this.currentTimePercent = -1;
      return;
    }

    this.currentTimePercent = ((nowMinutes - startMin) / (endMin - startMin)) * 100;
  }

  private formatTimeLabel(h: number, m: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  getHourLabel(slot: DayViewSlot): string {
    const [h] = slot.time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12} ${period}`;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'scheduled': return '#6366f1';
      case 'completed': return '#10b981';
      case 'cancelled': return '#ef4444';
      default: return '#64748b';
    }
  }

  getStatusBg(status: string): string {
    switch (status) {
      case 'scheduled': return 'linear-gradient(135deg, #ede9fe, #e0e7ff)';
      case 'completed': return 'linear-gradient(135deg, #d1fae5, #ecfdf5)';
      case 'cancelled': return 'linear-gradient(135deg, #fee2e2, #fef2f2)';
      default: return '#f1f5f9';
    }
  }

  getStatusBorder(status: string): string {
    switch (status) {
      case 'scheduled': return '#c7d2fe';
      case 'completed': return '#6ee7b7';
      case 'cancelled': return '#fecaca';
      default: return '#e2e8f0';
    }
  }

  onBookSlot(time: string): void {
    this.bookSlot.emit(time);
  }

  onAddVisit(appt: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.addVisit.emit(appt);
  }

  onReschedule(appt: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.rescheduleAppt.emit(appt);
  }

  onCancel(appt: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.cancelAppt.emit(appt);
  }

  onBackdropClick(): void {
    // Do nothing — modal closes only via the X button
  }

  onModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
}
