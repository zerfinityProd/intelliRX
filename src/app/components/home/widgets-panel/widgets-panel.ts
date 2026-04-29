import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Appointment } from '../../../models/appointment.model';
import { UserPermissions } from '../../../services/authorizationService';
import { DashboardDoctor } from '../home';

@Component({
  selector: 'app-widgets-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './widgets-panel.html',
  styleUrl: './widgets-panel.css',
  encapsulation: ViewEncapsulation.None
})
export class WidgetsPanelComponent {
  // Banner
  @Input() todayAppointmentCount: number = 0;
  @Input() isLoadingAppts: boolean = true;
  @Input() selectedDashboardDoctor: DashboardDoctor | null = null;

  // Doctor/Clinic context
  @Input() userRole: 'doctor' | 'receptionist' = 'doctor';
  @Input() doctorContextReady: boolean = false;

  // Doctor clinic switcher (doctor with multiple clinics)
  @Input() doctorClinics: Array<{ id: string; label: string }> = [];
  @Input() selectedDoctorClinicId: string = '';

  // Receptionist doctor selection
  @Input() dashboardDoctors: DashboardDoctor[] = [];
  @Input() selectedDashboardDoctorId: string = '';
  @Input() dashboardClinics: Array<{ id: string; label: string }> = [];
  @Input() selectedDashboardClinicId: string = '';

  // Calendar
  @Input() calendarMonthLabel: string = '';
  @Input() calendarDays: (Date | null)[] = [];
  @Input() selectedDate: Date | null = null;
  @Input() appointments: Appointment[] = [];

  // Permissions
  @Input() permissions!: UserPermissions;

  // Outputs
  @Output() selectedDoctorClinicIdChange = new EventEmitter<string>();
  @Output() doctorClinicChanged = new EventEmitter<void>();
  @Output() selectedDashboardClinicIdChange = new EventEmitter<string>();
  @Output() dashboardClinicChanged = new EventEmitter<void>();
  @Output() selectedDashboardDoctorIdChange = new EventEmitter<string>();
  @Output() dashboardDoctorChanged = new EventEmitter<void>();
  @Output() dayClicked = new EventEmitter<Date>();
  @Output() prevMonthClicked = new EventEmitter<void>();
  @Output() nextMonthClicked = new EventEmitter<void>();
  @Output() goToAppointmentsClicked = new EventEmitter<void>();
  @Output() addAppointmentClicked = new EventEmitter<void>();
  @Output() addPatientClicked = new EventEmitter<void>();

  onDoctorClinicChange(value: string): void {
    this.selectedDoctorClinicIdChange.emit(value);
    this.doctorClinicChanged.emit();
  }

  onDashboardClinicChange(value: string): void {
    this.selectedDashboardClinicIdChange.emit(value);
    this.dashboardClinicChanged.emit();
  }

  onDashboardDoctorChange(value: string): void {
    this.selectedDashboardDoctorIdChange.emit(value);
    this.dashboardDoctorChanged.emit();
  }

  // Calendar helpers - pure functions, no service dependency
  isToday(date: Date): boolean {
    const t = new Date();
    return date.getFullYear() === t.getFullYear()
      && date.getMonth() === t.getMonth()
      && date.getDate() === t.getDate();
  }

  isSelected(date: Date): boolean {
    if (!this.selectedDate) return false;
    return date.getFullYear() === this.selectedDate.getFullYear()
      && date.getMonth() === this.selectedDate.getMonth()
      && date.getDate() === this.selectedDate.getDate();
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
