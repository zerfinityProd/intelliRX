// src/app/components/add-appointment/add-appointment.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AppointmentService } from '../../services/appointmentService';
import { FirebaseService } from '../../services/firebase';
import { AuthenticationService } from '../../services/authenticationService';
import { Patient } from '../../models/patient.model';
import { NavbarComponent } from '../navbar/navbar';
import doctorsData from '../../data/doctors.json';

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  email: string;
}

@Component({
  selector: 'app-add-appointment',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './add-appointment.html',
  styleUrl: './add-appointment.css'
})
export class AddAppointmentComponent implements OnInit {

  step: 'new-patient-info' | 'appointment-details' = 'new-patient-info';

  // Name fields
  firstName: string = '';
  middleName: string = '';
  lastName: string = '';
  newPatientPhone: string = '';

  // Resolved after phone check
  matchedPatient: Patient | null = null;
  isExistingPatient: boolean = false;

  // Appointment details
  appointmentDate: string = '';
  selectedTimeSlot: string = '';
  selectedDoctorId: string = '';
  reason: string = '';
  notes: string = '';
  minDate: string = new Date().toISOString().split('T')[0];

  // Doctors list
  doctors: Doctor[] = doctorsData as Doctor[];

  // Time slots
  allTimeSlots: string[] = this.generateTimeSlots();
  bookedSlots: string[] = [];
  isLoadingSlots: boolean = false;

  errorMessage: string = '';
  isSubmitting: boolean = false;
  isCheckingPhone: boolean = false;

  private appointmentService = inject(AppointmentService);
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthenticationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['date']) {
        this.appointmentDate = params['date'];
        this.onDateChange();
      }
    });
  }

  get selectedDoctor(): Doctor | null {
    return this.doctors.find(d => d.id === this.selectedDoctorId) ?? null;
  }

  generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let hour = 9; hour < 18; hour++) {
      for (const min of [0, 30]) {
        const h = hour.toString().padStart(2, '0');
        const m = min.toString().padStart(2, '0');
        slots.push(`${h}:${m}`);
      }
    }
    return slots;
  }

  formatSlotLabel(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const endH = m === 30 ? (h + 1) : h;
    const endM = m === 30 ? '00' : '30';
    const endPeriod = endH >= 12 ? 'PM' : 'AM';
    const endH12 = endH % 12 || 12;
    return `${h12}:${m.toString().padStart(2,'0')} ${period} – ${endH12}:${endM} ${endPeriod}`;
  }

  get availableSlots(): string[] {
    return this.allTimeSlots.filter(s => !this.bookedSlots.includes(s));
  }

  async onDoctorChange(): Promise<void> {
    if (this.appointmentDate) await this.onDateChange();
  }

  async onDateChange(): Promise<void> {
    if (!this.appointmentDate) { this.bookedSlots = []; return; }
    this.isLoadingSlots = true;
    this.selectedTimeSlot = '';
    try {
      const all = await this.appointmentService.getAppointments();
      this.bookedSlots = all
        .filter(a => {
          const d = new Date(a.appointmentDate);
          const [y, mo, day] = this.appointmentDate.split('-').map(Number);
          const sameDay = d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
          const sameDoctor = this.selectedDoctorId
            ? (a.notes ?? '').includes(this.selectedDoctor?.name ?? '')
            : true;
          return sameDay && sameDoctor && a.status !== 'cancelled';
        })
        .map(a => a.appointmentTime);
    } catch {
      this.bookedSlots = [];
    }
    this.isLoadingSlots = false;
    this.cdr.markForCheck();
  }

  get fullName(): string {
    return [this.firstName.trim(), this.middleName.trim(), this.lastName.trim()]
      .filter(Boolean).join(' ');
  }

  async proceedFromNewPatient(): Promise<void> {
    if (!this.firstName.trim()) { this.errorMessage = 'First name is required'; return; }
    if (!this.lastName.trim()) { this.errorMessage = 'Last name is required'; return; }
    if (!this.newPatientPhone.trim() || !/^\d{10}$/.test(this.newPatientPhone.trim())) {
      this.errorMessage = 'Valid 10-digit phone number is required'; return;
    }
    this.errorMessage = '';
    this.isCheckingPhone = true;

    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) throw new Error('Not authenticated');
      const { results } = await this.firebaseService.searchPatientByPhone(
        this.newPatientPhone.trim(), userId
      );
      const name = this.fullName.toLowerCase();
      const exactMatch = results.find(p => p.name.trim().toLowerCase() === name);
      this.matchedPatient = exactMatch ?? null;
      this.isExistingPatient = !!exactMatch;
    } catch {
      this.matchedPatient = null;
      this.isExistingPatient = false;
    }

    this.isCheckingPhone = false;
    this.step = 'appointment-details';
    if (this.appointmentDate) await this.onDateChange();
    this.cdr.markForCheck();
  }

  async onSubmit(): Promise<void> {
    if (!this.appointmentDate) { this.errorMessage = 'Date is required'; return; }
    if (!this.selectedTimeSlot) { this.errorMessage = 'Please select a time slot'; return; }
    this.isSubmitting = true;
    this.errorMessage = '';

    const doctorNote = this.selectedDoctor
      ? `Doctor: ${this.selectedDoctor.name} (${this.selectedDoctor.specialty})`
      : '';
    const combinedNotes = [doctorNote, this.notes.trim()].filter(Boolean).join('\n');

    try {
      await this.appointmentService.createAppointment({
        patientId:       this.isExistingPatient ? (this.matchedPatient?.uniqueId ?? '') : '',
        patientName:     this.isExistingPatient ? (this.matchedPatient?.name ?? this.fullName) : this.fullName,
        patientPhone:    this.isExistingPatient ? (this.matchedPatient?.phone ?? this.newPatientPhone.trim()) : this.newPatientPhone.trim(),
        patientFamilyId: this.isExistingPatient ? (this.matchedPatient?.familyId ?? '') : '',
        appointmentDate: new Date(this.appointmentDate),
        appointmentTime: this.selectedTimeSlot,
        reason:  this.reason.trim(),
        notes:   combinedNotes,
        status:  'scheduled',
        isNewPatient: !this.isExistingPatient,
        doctorId: this.selectedDoctor?.email ?? ''
      });
      this.isSubmitting = false;

      const { default: Swal } = await import('sweetalert2');
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const result = await Swal.fire({
        title: 'Appointment Booked!',
        icon: 'success',
        showConfirmButton: true,
        confirmButtonText: 'View Appointments',
        confirmButtonColor: '#6366f1',
        showDenyButton: true,
        denyButtonText: 'Go Home',
        denyButtonColor: '#94a3b8',
        background: isDark ? '#1f1f1f' : '#ffffff',
        color:      isDark ? '#e0e0e0' : '#1e293b',
      });
      if (result.isConfirmed) {
        this.router.navigate(['/appointments']);
      } else {
        this.router.navigate(['/home']);
      }
    } catch (err: any) {
      this.isSubmitting = false;
      this.errorMessage = err?.message ?? 'Failed to book appointment';
    }
  }

  goBack(): void {
    if (this.step === 'appointment-details') {
      this.step = 'new-patient-info';
    } else {
      this.router.navigate(['/home']);
    }
    this.errorMessage = '';
  }

  goHome(): void { this.router.navigate(['/home']); }
}