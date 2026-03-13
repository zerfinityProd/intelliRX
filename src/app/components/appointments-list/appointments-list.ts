// src/app/components/appointments-list/appointments-list.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { AppointmentService } from '../../services/appointmentService';
import { Appointment } from '../../models/appointment.model';

@Component({
  selector: 'app-appointments-list',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './appointments-list.html',
  styleUrl: './appointments-list.css'
})
export class AppointmentsListComponent implements OnInit {
  appointments: Appointment[] = [];
  isLoading = true;
  errorMessage = '';
  filterStatus: string = 'all';

  private appointmentService = inject(AppointmentService);
  private router = inject(Router);

  get filtered(): Appointment[] {
    if (this.filterStatus === 'all') return this.appointments;
    return this.appointments.filter(a => a.status === this.filterStatus);
  }

  get todayCount(): number {
    const t = new Date();
    return this.appointments.filter(a => {
      const d = new Date(a.appointmentDate);
      return d.getFullYear() === t.getFullYear()
        && d.getMonth() === t.getMonth()
        && d.getDate() === t.getDate();
    }).length;
  }

  async ngOnInit(): Promise<void> {
    try {
      this.appointments = await this.appointmentService.getAppointments();
    } catch (e) {
      console.error('Appointments load error:', e);
      this.errorMessage = 'Failed to load appointments.';
      this.appointments = [];
    } finally {
      this.isLoading = false;
    }
  }

  async updateStatus(appt: Appointment, status: Appointment['status']): Promise<void> {
    await this.appointmentService.updateAppointmentStatus(appt.id!, status);
    appt.status = status;
  }

  goHome(): void { this.router.navigate(['/home']); }
  bookNew(): void { this.router.navigate(['/add-appointment']); }

  formatTime(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  statusClass(status: string): string {
    return { scheduled: 'badge-scheduled', completed: 'badge-completed',
      cancelled: 'badge-cancelled', 'no-show': 'badge-noshow' }[status] ?? '';
  }
}