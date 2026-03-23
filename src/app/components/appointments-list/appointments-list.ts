// src/app/components/appointments-list/appointments-list.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { AppointmentService } from '../../services/appointmentService';
import { Appointment } from '../../models/appointment.model';

export interface KanbanColumn {
  id: Appointment['status'];
  label: string;
  color: string;
  accent: string;
  icon: string;
}

@Component({
  selector: 'app-appointments-list',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './appointments-list.html',
  styleUrl: './appointments-list.css'
})
export class AppointmentsListComponent implements OnInit {
  appointments: Appointment[] = [];
  isLoading = true;
  errorMessage = '';

  // Date filter — defaults to today
  selectedDate: string = new Date().toISOString().split('T')[0];

  // Search
  searchTerm: string = '';

  // Drag state
  draggingCard: Appointment | null = null;
  dragOverColumn: Appointment['status'] | null = null;
  updatingId: string | null = null;

  private appointmentService = inject(AppointmentService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  readonly columns: KanbanColumn[] = [
    { id: 'scheduled',  label: 'Scheduled',  color: '#ede9fe', accent: '#6366f1', icon: 'clock'    },
    { id: 'completed',  label: 'Completed',  color: '#d1fae5', accent: '#10b981', icon: 'check'    },
    { id: 'cancelled',  label: 'Cancelled',  color: '#fee2e2', accent: '#ef4444', icon: 'x'        },
  ];

  get filteredAppointments(): Appointment[] {
    let result = this.appointments;

    if (this.selectedDate) {
      const [y, mo, day] = this.selectedDate.split('-').map(Number);
      result = result.filter(a => {
        const d = new Date(a.appointmentDate);
        return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
      });
    }

    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(a =>
        a.patientName.toLowerCase().includes(term) ||
        (a.patientPhone ?? '').includes(term)
      );
    }

    return result;
  }

  cardsFor(status: Appointment['status']): Appointment[] {
    return this.filteredAppointments.filter(a => a.status === status);
  }

  get totalToday(): number {
    const t = new Date();
    return this.appointments.filter(a => {
      const d = new Date(a.appointmentDate);
      return d.getFullYear() === t.getFullYear()
        && d.getMonth() === t.getMonth()
        && d.getDate() === t.getDate();
    }).length;
  }

  get isSelectedToday(): boolean {
    return this.selectedDate === new Date().toISOString().split('T')[0];
  }

  goToday(): void {
    this.selectedDate = new Date().toISOString().split('T')[0];
  }

  onDateInput(value: string): void {
    if (!value) return;
    const year = parseInt(value.split('-')[0], 10);
    if (year < 2000 || year > 2099) {
      this.selectedDate = new Date().toISOString().split('T')[0];
    } else {
      this.selectedDate = value;
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      this.appointments = await this.appointmentService.getAppointments();
    } catch (e) {
      this.errorMessage = 'Failed to load appointments.';
      this.appointments = [];
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Drag & Drop ──

  onDragStart(event: DragEvent, appt: Appointment): void {
    this.draggingCard = appt;
    event.dataTransfer?.setData('text/plain', appt.id ?? '');
    (event.target as HTMLElement).classList.add('kb-card--dragging');
  }

  onDragEnd(event: DragEvent): void {
    (event.target as HTMLElement).classList.remove('kb-card--dragging');
    this.draggingCard = null;
    this.dragOverColumn = null;
  }

  onDragOver(event: DragEvent, colId: Appointment['status']): void {
    event.preventDefault();
    this.dragOverColumn = colId;
  }

  onDragLeave(): void {
    this.dragOverColumn = null;
  }

  async onDrop(event: DragEvent, colId: Appointment['status']): Promise<void> {
    event.preventDefault();
    this.dragOverColumn = null;
    if (!this.draggingCard || this.draggingCard.status === colId) return;

    const appt = this.draggingCard;
    this.draggingCard = null;
    await this.updateStatus(appt, colId);
  }

  async updateStatus(appt: Appointment, status: Appointment['status']): Promise<void> {
    if (appt.status === status || this.updatingId === appt.id) return;
    this.updatingId = appt.id!;
    try {
      await this.appointmentService.updateAppointmentStatus(appt.id!, status);
      appt.status = status;
    } catch {
      this.errorMessage = 'Failed to update status. Please try again.';
    } finally {
      this.updatingId = null;
      this.cdr.detectChanges();
    }
  }

  goHome(): void { this.router.navigate(['/home']); }
  bookNew(): void { this.router.navigate(['/add-appointment']); }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  isToday(date: Date): boolean {
    const t = new Date(), d = new Date(date);
    return d.getFullYear() === t.getFullYear()
      && d.getMonth() === t.getMonth()
      && d.getDate() === t.getDate();
  }

  isFuture(date: Date): boolean {
    return new Date(date) > new Date();
  }
}