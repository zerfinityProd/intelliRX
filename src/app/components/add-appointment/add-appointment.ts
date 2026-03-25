// src/app/components/add-appointment/add-appointment.ts
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AppointmentService } from '../../services/appointmentService';
import { FirebaseService } from '../../services/firebase';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';
import { NavbarComponent } from '../navbar/navbar';
import doctorsData from '../../data/doctors.json';
import { normalizeEmail } from '../../utilities/normalize-email';

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

  // Name fields (new patient only)
  firstName: string = '';
  middleName: string = '';
  lastName: string = '';
  newPatientPhone: string = '';

  /** Patients in DB with this exact phone (after lookup) */
  phoneMatches: Patient[] = [];
  phoneLookupStatus: 'idle' | 'loading' | 'done' = 'idle';
  /** User chose to register a new patient despite matches (same household phone, etc.) */
  intentNewPatient = false;

  // Resolved after selection / new-patient entry
  matchedPatient: Patient | null = null;
  isExistingPatient: boolean = false;

  private phoneLookupDebounce: ReturnType<typeof setTimeout> | null = null;

  // Appointment details
  appointmentDate: string = new Date().toISOString().split('T')[0];
  selectedTimeSlot: string = '';
  selectedDoctorId: string = '';
  // Ailments chips (same style/idea as Add Patient)
  ailmentChips: string[] = [];
  newAilmentInput: string = '';
  minDate: string = new Date().toISOString().split('T')[0];
  maxDate: string = '9999-12-31';

  userRole: 'doctor' | 'receptionist' = 'doctor';
  canChooseDoctor: boolean = true;
  doctorContextReady: boolean = false;

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
  private authorizationService = inject(AuthorizationService);
  private patientService = inject(PatientService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  // If opened from a patient card, we can skip phone/name entry.
  private openedFromPatientId: string | null = null;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const patientId = params['patientId'];
      if (patientId) {
        this.applyPatientPrefill(params);
      }
      if (params['date']) {
        this.appointmentDate = params['date'];
        this.onDateChange();
      }
    });

    // Set doctor dropdown + slot availability based on user role.
    void this.initDoctorContext();
  }

  private async initDoctorContext(): Promise<void> {
    const rawEmail = this.authService.currentUserValue?.email || '';
    this.doctorContextReady = false;

    try {
      if (rawEmail) {
        this.userRole = await this.authorizationService.getUserRole(rawEmail);
      }
    } catch {
      this.userRole = 'doctor';
    }

    // Doctor: lock to the single doctor record matching this email.
    if (this.userRole === 'doctor') {
      this.canChooseDoctor = false;
      const authEmail = rawEmail ? normalizeEmail(rawEmail) : '';
      const match = authEmail
        ? this.doctors.find(d => normalizeEmail(d.email) === authEmail)
        : undefined;

      this.doctors = match ? [match] : [];
      this.selectedDoctorId = match?.id ?? '';
    } else {
      // Receptionist: can choose any doctor.
      this.canChooseDoctor = true;
      const authEmail = rawEmail ? normalizeEmail(rawEmail) : '';
      const match = authEmail
        ? this.doctors.find(d => normalizeEmail(d.email) === authEmail)
        : undefined;
      this.selectedDoctorId = match?.id ?? '';
    }

    this.doctorContextReady = true;
    if (this.appointmentDate) {
      await this.onDateChange();
    }
    this.cdr.markForCheck();
  }

  private applyPatientPrefill(params: any): void {
    const patientId = String(params['patientId'] ?? '').trim();
    if (!patientId) return;

    const patientName = String(params['patientName'] ?? '').trim();
    const patientPhoneRaw = String(params['patientPhone'] ?? '').trim();
    const patientFamilyId = String(params['patientFamilyId'] ?? '').trim();

    const phoneDigits = this.normalizePhoneDigits(patientPhoneRaw);
    const parts = patientName.split(/\s+/).filter(Boolean);

    this.openedFromPatientId = patientId;
    this.step = 'appointment-details';
    this.intentNewPatient = false;
    this.isExistingPatient = true;

    // Keep step-2 chip consistent
    this.newPatientPhone = phoneDigits;
    this.phoneLookupStatus = 'done';
    this.phoneMatches = [];

    this.firstName = parts[0] ?? '';
    this.middleName = parts.length > 2 ? parts.slice(1, parts.length - 1).join(' ') : '';
    this.lastName = parts.length > 1 ? parts[parts.length - 1] : '';

    const userId = this.authService.getCurrentUserId() ?? '';
    this.matchedPatient = {
      uniqueId: patientId,
      userId,
      familyId: patientFamilyId,
      name: patientName || this.fullName || patientName,
      phone: phoneDigits,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Patient;

    this.phoneMatches = this.matchedPatient ? [this.matchedPatient] : [];
    this.errorMessage = '';
    this.cdr.markForCheck();
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

  // ── Ailment chips ──
  onAilmentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = this.newAilmentInput.trim();
      if (trimmed && !this.ailmentChips.includes(trimmed)) {
        this.ailmentChips.push(trimmed);
        this.newAilmentInput = '';
      }
    }
  }

  onAilmentBlur(): void {
    const trimmed = this.newAilmentInput.trim();
    if (trimmed && !this.ailmentChips.includes(trimmed)) {
      this.ailmentChips.push(trimmed);
      this.newAilmentInput = '';
    }
  }

  removeAilment(index: number): void {
    this.ailmentChips.splice(index, 1);
  }

  async onDateChange(): Promise<void> {
    if (!this.appointmentDate) { this.bookedSlots = []; return; }
    this.isLoadingSlots = true;
    this.selectedTimeSlot = '';
    try {
      const selectedDoctorEmail = this.selectedDoctor?.email
        ? normalizeEmail(this.selectedDoctor.email)
        : '';
      const all = await this.appointmentService.getAppointments();
      this.bookedSlots = all
        .filter(a => {
          const d = new Date(a.appointmentDate);
          const [y, mo, day] = this.appointmentDate.split('-').map(Number);
          const sameDay = d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
          const sameDoctor = (this.selectedDoctorId && selectedDoctorEmail)
            ? normalizeEmail(a.doctorId || '') === selectedDoctorEmail
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

  /** Digits only, max 10 — used for search and Firestore matching */
  get normalizedPhoneDigits(): string {
    return this.newPatientPhone.replace(/\D/g, '').slice(0, 10);
  }

  /** Display name for step 2 chip */
  get displayPatientName(): string {
    if (this.matchedPatient && !this.intentNewPatient) {
      return this.matchedPatient.name.trim();
    }
    return this.fullName;
  }

  /** Whether name fields are required on step 1 */
  get needsNewPatientNames(): boolean {
    return this.phoneLookupStatus === 'done' &&
      (this.phoneMatches.length === 0 || this.intentNewPatient);
  }

  /** Can advance: valid phone, lookup done, and either existing selection or new names */
  get canProceedStep1(): boolean {
    if (this.normalizedPhoneDigits.length !== 10 || this.phoneLookupStatus !== 'done') {
      return false;
    }
    if (this.phoneMatches.length > 0 && !this.intentNewPatient) {
      return this.matchedPatient !== null;
    }
    return !!(this.firstName.trim() && this.lastName.trim());
  }

  normalizePhoneDigits(phone: string): string {
    return String(phone).replace(/\D/g, '');
  }

  onPhoneModelChange(value: string): void {
    this.newPatientPhone = value.replace(/\D/g, '').slice(0, 10);
    this.onPhoneInput();
  }

  onPhoneInput(): void {
    this.errorMessage = '';
    if (this.phoneLookupDebounce) {
      clearTimeout(this.phoneLookupDebounce);
    }
    if (this.normalizedPhoneDigits.length !== 10) {
      this.phoneLookupStatus = 'idle';
      this.phoneMatches = [];
      this.matchedPatient = null;
      this.intentNewPatient = false;
      this.cdr.markForCheck();
      return;
    }
    this.phoneLookupDebounce = setTimeout(() => {
      void this.lookupPatientsByPhone();
    }, 450);
  }

  async lookupPatientsByPhone(): Promise<void> {
    const digits = this.normalizedPhoneDigits;
    if (digits.length !== 10) {
      this.errorMessage = 'Enter a valid 10-digit phone number';
      return;
    }
    this.errorMessage = '';
    this.phoneLookupStatus = 'loading';
    this.phoneMatches = [];
    this.matchedPatient = null;
    this.intentNewPatient = false;
    this.firstName = '';
    this.middleName = '';
    this.lastName = '';

    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) throw new Error('Not authenticated');
      const { results } = await this.firebaseService.searchPatientByPhone(digits, userId);
      const exact = results.filter(p => this.normalizePhoneDigits(p.phone) === digits);
      this.phoneMatches = exact;
      if (exact.length === 1) {
        this.selectExistingPatient(exact[0]);
      }
    } catch {
      this.phoneMatches = [];
    }

    this.phoneLookupStatus = 'done';
    this.cdr.markForCheck();
  }

  selectExistingPatient(p: Patient): void {
    this.intentNewPatient = false;
    this.matchedPatient = p;
    this.isExistingPatient = true;
    this.firstName = '';
    this.middleName = '';
    this.lastName = '';
    this.errorMessage = '';
    this.cdr.markForCheck();
  }

  chooseNewPatientInstead(): void {
    this.intentNewPatient = true;
    this.matchedPatient = null;
    this.isExistingPatient = false;
    this.errorMessage = '';
    this.cdr.markForCheck();
  }

  async proceedFromNewPatient(): Promise<void> {
    if (this.normalizedPhoneDigits.length !== 10) {
      this.errorMessage = 'Valid 10-digit phone number is required';
      return;
    }
    if (this.phoneLookupStatus !== 'done') {
      await this.lookupPatientsByPhone();
    }
    if (this.phoneLookupStatus !== 'done') {
      this.errorMessage = 'Could not verify this phone number. Try again.';
      return;
    }

    if (this.phoneMatches.length > 0 && !this.intentNewPatient && !this.matchedPatient) {
      this.errorMessage = 'Select a patient from the list, or choose “New patient” to enter a name.';
      return;
    }

    if (this.needsNewPatientNames) {
      if (!this.firstName.trim()) { this.errorMessage = 'First name is required'; return; }
      if (!this.lastName.trim()) { this.errorMessage = 'Last name is required'; return; }
      this.matchedPatient = null;
      this.isExistingPatient = false;
    } else if (this.matchedPatient) {
      this.isExistingPatient = true;
    }

    this.errorMessage = '';
    this.isCheckingPhone = true;
    try {
      this.step = 'appointment-details';
      if (this.appointmentDate) await this.onDateChange();
    } finally {
      this.isCheckingPhone = false;
      this.cdr.markForCheck();
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.appointmentDate) { this.errorMessage = 'Date is required'; return; }
    // Enforce YYYY-MM-DD and 4-digit year.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.appointmentDate)) {
      this.errorMessage = 'Invalid date format';
      return;
    }
    const year = new Date(this.appointmentDate).getFullYear();
    if (!Number.isFinite(year) || year < 1000 || year > 9999) {
      this.errorMessage = 'Year must be 4 digits';
      return;
    }
    if (!this.selectedTimeSlot) { this.errorMessage = 'Please select a time slot'; return; }
    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const ailmentsText = this.ailmentChips.join(', ');

      const rawEmail = this.authService.currentUserValue?.email || '';
      const authEmail = rawEmail ? normalizeEmail(rawEmail) : '';
      const authDoctor = this.doctors.find(d => normalizeEmail(d.email) === authEmail);

      await this.appointmentService.createAppointment({
        patientId:       this.isExistingPatient ? (this.matchedPatient?.uniqueId ?? '') : '',
        patientName:     this.isExistingPatient ? (this.matchedPatient?.name ?? this.fullName) : this.fullName,
        patientPhone:    this.isExistingPatient
          ? (this.matchedPatient?.phone ?? this.normalizedPhoneDigits)
          : this.normalizedPhoneDigits,
        patientFamilyId: this.isExistingPatient ? (this.matchedPatient?.familyId ?? '') : '',
        appointmentDate: new Date(this.appointmentDate),
        appointmentTime: this.selectedTimeSlot,
        ailments: ailmentsText,
        status:  'scheduled',
        isNewPatient: !this.isExistingPatient,
        doctorId: this.selectedDoctor?.email
          ? normalizeEmail(this.selectedDoctor.email)
          : (authDoctor?.email ? normalizeEmail(authDoctor.email) : '')
      });

      // If patient already exists, immediately persist ailments to the patient record
      // so they appear on "Add Visit" right after.
      if (ailmentsText.trim() && this.isExistingPatient && this.matchedPatient?.uniqueId) {
        await this.patientService.updatePatient(this.matchedPatient.uniqueId, { ailments: ailmentsText });
      }

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
      if (this.openedFromPatientId) {
        this.router.navigate(['/patient', this.openedFromPatientId]);
        return;
      }
      this.step = 'new-patient-info';
    } else {
      this.router.navigate(['/home']);
    }
    this.errorMessage = '';
  }

  formatPhoneDisplay(digits: string): string {
    const d = digits.replace(/\D/g, '').slice(0, 10);
    if (d.length <= 5) return d;
    if (d.length <= 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
    return d;
  }

  goHome(): void { this.router.navigate(['/home']); }
}