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
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { generateTimeSlotsFromConfig } from '../../utilities/timeSlotUtils';
import { ClinicContextService } from '../../services/clinicContextService';
import { todayLocalISO } from '../../utilities/local-date';

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

  // Additional patient fields (new patient only)
  dateOfBirth: string = '';
  gender: string = '';
  patientEmail: string = '';
  allergyChips: string[] = [];
  newAllergyInput: string = '';
  familyIdPreview: string = '';
  todayDate: string = todayLocalISO();

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
  appointmentDate: string = todayLocalISO();
  selectedTimeSlot: string = '';
  selectedDoctorId: string = '';
  readonly phoneMaxDigits: number = DEFAULT_SYSTEM_SETTINGS.patient.phoneMaxDigits;
  // Ailments chips (same style/idea as Add Patient)
  ailmentChips: string[] = [];
  newAilmentInput: string = '';
  minDate: string = todayLocalISO();
  maxDate: string = '9999-12-31';

  userRole: 'doctor' | 'receptionist' = 'doctor';
  canChooseDoctor: boolean = true;
  doctorContextReady: boolean = false;

  // Doctors list
  doctors: Doctor[] = doctorsData as Doctor[];

  // Clinic-first selection (receptionist flow)
  clinics: Array<{ id: string; label: string }> = [];
  selectedClinicId: string = '';
  subscriptionId: string | null = null;
  private readonly doctorClinicCache = new Map<string, string[]>();

  // Time slots
  allTimeSlots: string[] = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
  bookedSlots: string[] = [];
  isLoadingSlots: boolean = false;

  errorMessage: string = '';
  newPatientWarning: string = '';
  isSubmitting: boolean = false;
  private duplicateCheckTimer: ReturnType<typeof setTimeout> | null = null;
  isCheckingPhone: boolean = false;

  private appointmentService = inject(AppointmentService);
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthenticationService);
  private authorizationService = inject(AuthorizationService);
  private patientService = inject(PatientService);
  private clinicContextService = inject(ClinicContextService);
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
      // Pre-select doctor when navigated from dashboard with a specific doctor
      if (params['doctorId']) {
        this.selectedDoctorId = params['doctorId'];
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

      // Prefer clinic selected at login; otherwise attempt to load.
      this.selectedClinicId = this.clinicContextService.getSelectedClinicId() ?? '';
      this.subscriptionId = this.clinicContextService.getSubscriptionId();
      if (!this.selectedClinicId && rawEmail) {
        try {
          const clinics = await this.authorizationService.getUserClinicIds(rawEmail);
          if (clinics.length) {
            this.selectedClinicId = clinics[0];
          }
        } catch {
          // Keep empty — legacy compatibility
        }
      }
      // Persist resolved clinic context so AddPatient and other components use it too.
      if (this.selectedClinicId) {
        this.clinicContextService.setClinicContext(
          this.selectedClinicId,
          this.subscriptionId
        );
      }
    } else {
      // Receptionist: can choose any doctor.
      this.canChooseDoctor = true;

      this.subscriptionId = rawEmail
        ? await this.authorizationService.getUserSubscriptionId(rawEmail).catch(() => null)
        : null;

      // Load clinics (SaaS scoping)
      if (rawEmail) {
        try {
          const clinicIds = await this.authorizationService.getUserClinicIds(rawEmail);
          this.clinics = clinicIds.map(id => ({ id, label: `Clinic ${id}` }));
          this.selectedClinicId = clinicIds[0] ?? '';
          this.clinicContextService.setClinicContext(
            this.selectedClinicId || null,
            this.subscriptionId ?? null
          );
        } catch {
          this.clinics = [];
          this.selectedClinicId = '';
        }
      }

      await this.refreshDoctorsForSelectedClinic();
    }

    this.doctorContextReady = true;
    if (this.appointmentDate) {
      await this.onDateChange();
    }
    this.cdr.markForCheck();
  }

  private async getDoctorClinicIds(doctorEmail: string): Promise<string[]> {
    const key = normalizeEmail(doctorEmail);
    if (this.doctorClinicCache.has(key)) return this.doctorClinicCache.get(key)!;
    try {
      const clinicIds = await this.authorizationService.getUserClinicIds(doctorEmail);
      this.doctorClinicCache.set(key, clinicIds);
      return clinicIds;
    } catch {
      this.doctorClinicCache.set(key, []);
      return [];
    }
  }

  private async refreshDoctorsForSelectedClinic(): Promise<void> {
    // If clinic isn't known yet (legacy mode), keep previous behavior.
    if (!this.selectedClinicId) {
      this.doctors = doctorsData as Doctor[];
    } else {
      const clinicId = this.selectedClinicId;
      const all = doctorsData as Doctor[];
      const filtered: Doctor[] = [];
      for (const doc of all) {
        const clinicIds = await this.getDoctorClinicIds(doc.email);
        // Strict: only show doctors explicitly assigned to this clinic.
        if (clinicIds.includes(clinicId)) {
          filtered.push(doc);
        }
      }
      this.doctors = filtered;
    }

    // Preselect doctor if receptionist email matches one of the clinic-scoped doctors.
    const rawEmail = this.authService.currentUserValue?.email || '';
    const authEmail = rawEmail ? normalizeEmail(rawEmail) : '';
    const match = authEmail
      ? this.doctors.find(d => normalizeEmail(d.email) === authEmail)
      : undefined;

    this.selectedDoctorId = match?.id ?? '';
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
    // Kept for backward compatibility inside the component.
    // Main source of truth is now DEFAULT_SYSTEM_SETTINGS.
    return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
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

  /** True when the slot is in the past for today's date */
  isSlotInPast(slot: string): boolean {
    if (!this.appointmentDate) return false;
    const today = new Date();
    const [y, mo, day] = this.appointmentDate.split('-').map(Number);
    const isToday = today.getFullYear() === y && today.getMonth() === mo - 1 && today.getDate() === day;
    if (!isToday) return false;
    const [h, m] = slot.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    return slotMinutes <= nowMinutes;
  }

  get availableSlots(): string[] {
    return this.allTimeSlots.filter(s => !this.bookedSlots.includes(s) && !this.isSlotInPast(s));
  }

  async onDoctorChange(): Promise<void> {
    if (this.appointmentDate) await this.onDateChange();
  }

  async onClinicChange(): Promise<void> {
    // Clinic-first booking: changing clinic resets doctor selection.
    if (this.canChooseDoctor) {
      this.selectedDoctorId = '';
    }

    // Update the shared clinic context so services use the new clinicId.
    this.clinicContextService.setClinicContext(
      this.selectedClinicId || null,
      this.subscriptionId ?? null
    );

    await this.refreshDoctorsForSelectedClinic();

    // Re-run phone lookup if a phone was already searched — results are clinic-scoped.
    if (this.phoneLookupStatus === 'done' && this.normalizedPhoneDigits.length === this.phoneMaxDigits) {
      await this.lookupPatientsByPhone();
    }

    // Ensure doctor selection refresh triggers updated availability.
    if (this.appointmentDate) await this.onDateChange();
  }

  // ── Allergy chips ──
  onAllergyKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = this.newAllergyInput.trim();
      if (trimmed && !this.allergyChips.includes(trimmed)) {
        this.allergyChips.push(trimmed);
        this.newAllergyInput = '';
      }
    }
  }

  onAllergyBlur(): void {
    const trimmed = this.newAllergyInput.trim();
    if (trimmed && !this.allergyChips.includes(trimmed)) {
      this.allergyChips.push(trimmed);
      this.newAllergyInput = '';
    }
  }

  removeAllergy(index: number): void {
    this.allergyChips.splice(index, 1);
  }

  /** Normalize a name for comparison: trim, lowercase, collapse whitespace */
  private normalizeName(name: string): string {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /** Check if the entered name matches any patient already in phoneMatches */
  private isDuplicateOfPhoneMatch(): import('../../models/patient.model').Patient | null {
    const enteredName = this.normalizeName(this.fullName);
    if (!enteredName) return null;
    return this.phoneMatches.find(p => this.normalizeName(p.name) === enteredName) ?? null;
  }

  /** Update family ID preview and check for duplicate patients */
  updateFamilyIdPreview(): void {
    const name = this.fullName.trim();
    const phone = this.normalizedPhoneDigits;
    const parts = name.split(' ').filter(Boolean);
    if (parts.length < 2 || !phone) {
      this.familyIdPreview = '';
      this.newPatientWarning = '';
      return;
    }
    const lastName = parts[parts.length - 1].toLowerCase();
    this.familyIdPreview = `${lastName}_${phone}`;

    // Cancel any pending Firestore check first
    if (this.duplicateCheckTimer) clearTimeout(this.duplicateCheckTimer);

    // Instant client-side check against already-loaded phone matches
    const dup = this.isDuplicateOfPhoneMatch();
    if (dup) {
      this.newPatientWarning = `Patient "${dup.name}" already exists. Please select them from the list above.`;
      this.cdr.markForCheck();
      return;
    }

    // Debounce the Firestore duplicate check as fallback
    this.duplicateCheckTimer = setTimeout(async () => {
      // Re-check local matches before overwriting — avoids race condition
      if (this.isDuplicateOfPhoneMatch()) return;
      try {
        const exists = await this.patientService.checkUniqueIdExists(name, phone);
        // Re-check again after await — user may have typed more
        if (this.isDuplicateOfPhoneMatch()) return;
        this.newPatientWarning = exists
          ? 'This patient already exists. Please select them from the list above instead.'
          : '';
        this.cdr.markForCheck();
      } catch {
        if (!this.isDuplicateOfPhoneMatch()) {
          this.newPatientWarning = '';
        }
      }
    }, 300);
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
          const sameClinic = this.selectedClinicId
            ? (a.clinicId ? a.clinicId === this.selectedClinicId : true)
            : true;
          return sameDay && sameDoctor && sameClinic && a.status !== 'cancelled';
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
    return this.newPatientPhone.replace(/\D/g, '').slice(0, this.phoneMaxDigits);
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

  /** Can advance: valid phone, lookup done, and either existing selection or new names.
   *  Receptionist must also have clinic + doctor selected.
   *  Blocked when duplicate patient warning is active. */
  get canProceedStep1(): boolean {
    // Receptionist must pick clinic & doctor first.
    if (this.canChooseDoctor && (!this.selectedClinicId || !this.selectedDoctorId)) {
      return false;
    }
    if (this.normalizedPhoneDigits.length !== this.phoneMaxDigits || this.phoneLookupStatus !== 'done') {
      return false;
    }
    // Block if duplicate patient detected (only when entering new patient names).
    if (this.newPatientWarning && this.needsNewPatientNames) {
      return false;
    }
    if (this.phoneMatches.length > 0 && !this.intentNewPatient) {
      return this.matchedPatient !== null;
    }
    return !!(this.firstName.trim() && this.lastName.trim());
  }

  normalizePhoneDigits(phone: string): string {
    return String(phone).replace(/\D/g, '').slice(0, this.phoneMaxDigits);
  }

  onPhoneModelChange(value: string): void {
    this.newPatientPhone = value.replace(/\D/g, '').slice(0, this.phoneMaxDigits);
    this.updateFamilyIdPreview();
    this.onPhoneInput();
  }

  onPhoneInput(): void {
    this.errorMessage = '';
    if (this.phoneLookupDebounce) {
      clearTimeout(this.phoneLookupDebounce);
    }
    if (this.normalizedPhoneDigits.length !== this.phoneMaxDigits) {
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
    if (digits.length !== this.phoneMaxDigits) {
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
    this.dateOfBirth = '';
    this.gender = '';
    this.patientEmail = '';
    this.allergyChips = [];
    this.newAllergyInput = '';
    this.familyIdPreview = '';

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.phoneLookupStatus = 'done';
      this.cdr.markForCheck();
      return;
    }
    const clinicId = this.selectedClinicId || undefined;
    let exact: import('../../models/patient.model').Patient[] = [];

    // Attempt 1: search with clinicId
    try {
      const { results } = await this.firebaseService.searchPatientByPhone(digits, userId, null, clinicId);
      exact = results.filter(p => this.normalizePhoneDigits(p.phone) === digits);
      console.log(`📞 Phone lookup (clinic=${clinicId}): ${results.length} raw, ${exact.length} exact`);
    } catch (err) {
      console.warn('Phone lookup (clinic-scoped) failed:', err);
    }

    // Attempt 2: clinic-scoped contains search (no composite index needed)
    // This finds patients created by ANY user within the same clinic (doctor ↔ receptionist)
    if (exact.length === 0 && clinicId) {
      try {
        const { results: containsResults } = await this.firebaseService.searchPatientsContaining(digits, userId, clinicId);
        exact = containsResults.filter(p => this.normalizePhoneDigits(p.phone) === digits);
        console.log(`📞 Phone lookup (clinic contains): ${exact.length} exact match(es)`);
      } catch (err) {
        console.warn('Phone lookup (clinic contains) failed:', err);
      }
    }

    // Attempt 3: retry WITHOUT clinicId to find legacy patients (no clinicId field)
    if (exact.length === 0 && clinicId) {
      try {
        const { results: fallbackResults } = await this.firebaseService.searchPatientByPhone(digits, userId, null, undefined);
        // Only include legacy patients (no clinicId) — NEVER patients from other clinics
        exact = fallbackResults.filter(p =>
          this.normalizePhoneDigits(p.phone) === digits && !p.clinicId
        );
      } catch (err) {
        console.warn('Phone lookup (legacy fallback) failed:', err);
      }
    }

    // Attempt 4: ultimate fallback — userId-scoped contains search
    if (exact.length === 0) {
      try {
        const { results: containsResults } = await this.firebaseService.searchPatientsContaining(digits, userId, undefined);
        exact = containsResults.filter(p =>
          this.normalizePhoneDigits(p.phone) === digits && !p.clinicId
        );
      } catch (err) {
        console.warn('Phone lookup (userId contains fallback) failed:', err);
      }
    }

    this.phoneMatches = exact;
    if (exact.length === 1) {
      this.selectExistingPatient(exact[0]);
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
    this.newPatientWarning = '';
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
    if (this.normalizedPhoneDigits.length !== this.phoneMaxDigits) {
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

    // Block if user typed the same name as an existing patient in the phone matches
    if (this.intentNewPatient && this.phoneMatches.length > 0) {
      const dup = this.isDuplicateOfPhoneMatch();
      if (dup) {
        this.errorMessage = `Patient "${dup.name}" already exists with this phone number. Please select them from the list above instead of creating a duplicate.`;
        this.newPatientWarning = this.errorMessage;
        this.cdr.markForCheck();
        return;
      }
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
      const allergiesText = this.allergyChips.join(', ');

      const rawEmail = this.authService.currentUserValue?.email || '';
      const authEmail = rawEmail ? normalizeEmail(rawEmail) : '';
      const authDoctor = this.doctors.find(d => normalizeEmail(d.email) === authEmail);

      let patientId = '';
      let patientName = this.fullName;
      let patientPhone = this.normalizedPhoneDigits;
      let patientFamilyId = '';

      if (this.isExistingPatient && this.matchedPatient) {
        // Existing patient
        patientId = this.matchedPatient.uniqueId;
        patientName = this.matchedPatient.name ?? this.fullName;
        patientPhone = this.matchedPatient.phone ?? this.normalizedPhoneDigits;
        patientFamilyId = this.matchedPatient.familyId ?? '';

        // Persist ailments/allergies to existing patient record
        const updateData: any = {};
        if (ailmentsText.trim()) updateData.ailments = ailmentsText;
        if (allergiesText.trim()) updateData.allergies = allergiesText;
        if (Object.keys(updateData).length > 0) {
          await this.patientService.updatePatient(patientId, updateData);
        }
      } else {
        // New patient — create the patient record in the database
        const patientData: any = {
          name: this.fullName,
          phone: this.normalizedPhoneDigits
        };
        if (this.patientEmail.trim()) patientData.email = this.patientEmail.trim();
        if (this.dateOfBirth) patientData.dateOfBirth = new Date(this.dateOfBirth);
        if (this.gender) patientData.gender = this.gender;
        if (allergiesText) patientData.allergies = allergiesText;
        if (ailmentsText) patientData.ailments = ailmentsText;

        patientId = await this.patientService.createPatient({ ...patientData, clinicId: this.selectedClinicId || undefined });
        // After creation, fetch the familyId generated by the service
        const createdPatient = await this.patientService.getPatient(patientId);
        patientFamilyId = createdPatient?.familyId ?? '';
        patientName = createdPatient?.name ?? this.fullName;
        patientPhone = createdPatient?.phone ?? this.normalizedPhoneDigits;
      }

      await this.appointmentService.createAppointment({
        patientId,
        patientName,
        patientPhone,
        patientFamilyId,
        appointmentDate: new Date(this.appointmentDate),
        appointmentTime: this.selectedTimeSlot,
        ailments: ailmentsText,
        status:  'scheduled',
        isNewPatient: !this.isExistingPatient,
        doctorId: this.selectedDoctor?.email
          ? normalizeEmail(this.selectedDoctor.email)
          : (authDoctor?.email ? normalizeEmail(authDoctor.email) : ''),
        clinicId: this.selectedClinicId || undefined,
        subscriptionId: this.subscriptionId || this.clinicContextService.getSubscriptionId() || undefined
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
    const d = digits.replace(/\D/g, '').slice(0, this.phoneMaxDigits);
    if (d.length <= 5) return d;
    if (d.length <= 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
    return d;
  }

  goHome(): void { this.router.navigate(['/home']); }
}