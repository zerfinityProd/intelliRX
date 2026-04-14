import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  Firestore, collection, query, where, getCountFromServer
} from '@angular/fire/firestore';
import { PatientService } from '../../services/patient';
import { UIStateService } from '../../services/uiStateService';
import { AppointmentService } from '../../services/appointmentService';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { UserPermissions } from '../../services/authorizationService';
import { ClinicContextService } from '../../services/clinicContextService';
import { ClinicService } from '../../services/clinicService';
import { Patient } from '../../models/patient.model';
import { Appointment } from '../../models/appointment.model';
import { AddPatientComponent } from '../add-patient/add-patient';
import { DayViewModalComponent } from '../day-view-modal/day-view-modal';
import { NavbarComponent } from '../navbar/navbar';
import { MomentDatePipe } from '../../pipes/moment-date.pipe';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { generateTimeSlotsFromConfig, generateTimeSlotsFromClinicTimings, filterTimingsByAvailability, getWeekdayKey, isClinicOpenOnDate } from '../../utilities/timeSlotUtils';
import { normalizeEmail } from '../../utilities/normalize-email';


export interface DashboardDoctor {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  email: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AddPatientComponent, NavbarComponent, MomentDatePipe, DayViewModalComponent],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit {
  searchTerm: string = '';
  searchResults: Patient[] = [];
  searchResults$: Observable<Patient[]>;
  errorMessage: string = '';
  isSearching: boolean = false;
  uiState$: Observable<any>;

  // Calendar & appointments
  calendarDate: Date = new Date();
  selectedDate: Date | null = null;
  appointments: Appointment[] = [];
  isLoadingAppts: boolean = true;
  totalPatients: number = 0;

  // Doctor / clinic selection (receptionist flow)
  userRole: 'doctor' | 'receptionist' = 'doctor';
  dashboardDoctors: DashboardDoctor[] = [];
  selectedDashboardDoctorId: string = '';
  dashboardClinics: Array<{ id: string; label: string }> = [];
  selectedDashboardClinicId: string = '';
  doctorContextReady: boolean = false;
  private readonly doctorClinicCache = new Map<string, string[]>();

  // Doctor clinic switcher (for doctors with multiple clinics)
  doctorClinics: Array<{ id: string; label: string }> = [];
  selectedDoctorClinicId: string = '';

  // Slot viewer
  showSlots: boolean = false;
  bookedSlotsForSelected: string[] = [];
  isLoadingSlots: boolean = false;
  allTimeSlots: string[] = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);

  // Day View Modal state
  showDayViewModal = false;
  dayViewDate: Date | null = null;
  dayViewAppointments: Appointment[] = [];
  dayViewBookedSlots: string[] = [];
  isLoadingDayView = false;

  get hasMoreResults(): boolean { return this.patientService.hasMoreResults; }
  get isLoadingMore(): boolean { return this.patientService.isLoadingMore; }

  private searchTimeout: any;

  // Prefill for Add Patient (used from appointment cards)
  addPatientPrefillName: string = '';
  addPatientPrefillPhone: string = '';
  addPatientPrefillAilments: string = '';

  // Permissions
  permissions: UserPermissions = {
    canDelete: false, canEdit: false, canAddPatient: false,
    canAddVisit: false, canAppointment: false, canCancel: false,
    canEditVisit: false,
  };

  constructor(
    private patientService: PatientService,
    private uiStateService: UIStateService,
    private appointmentService: AppointmentService,
    private authService: AuthenticationService,
    private authorizationService: AuthorizationService,
    private clinicContextService: ClinicContextService,
    private clinicService: ClinicService,
    private db: Firestore,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.uiState$ = this.uiStateService.getUIState();
    this.searchResults$ = this.patientService.searchResults$;
  }

  ngOnInit(): void {
    this.clearSearch();

    // If navigated here with prefill query params, open Add Patient modal.
    const qp = this.route.snapshot.queryParams || {};
    if (qp['openAddPatient'] === '1') {
      this.addPatientPrefillName = String(qp['name'] ?? '');
      this.addPatientPrefillPhone = String(qp['phone'] ?? '');
      this.addPatientPrefillAilments = String(qp['ailments'] ?? '');
      this.uiStateService.openAddPatientForm();
      this.clearAddPatientQueryParams();
    }

    this.patientService.searchResults$.subscribe(results => {
      this.searchResults = results;
      this.isSearching = false;
      this.cdr.markForCheck();
    });

    // Ensure clinic/subscription context is resolved BEFORE loading appointments
    void this.initializeAndLoad();
  }

  /**
   * Sequentially resolve clinic context → dashboard doctor context → load data.
   * This prevents "Subscription context not set" errors.
   */
  private async initializeAndLoad(): Promise<void> {
    await this.ensureClinicContext();
    await this.initDashboardDoctorContext();
    await this.loadAppointments();
    this.restoreDayViewFromSession();
    this.loadPatientCount();
  }

  /**
   * Ensure the doctor's clinic context is set so patients created
   * from Add-Patient modal are associated with the correct clinic
   * and visible to reception staff.
   */
  private async ensureClinicContext(): Promise<void> {
    // Already set (from login or localStorage) — nothing to do.
    if (this.clinicContextService.getSelectedClinicId() && this.clinicContextService.getSubscriptionId()) return;

    // Wait for Firebase auth to resolve before reading user email
    await firstValueFrom(this.authService.authReady$.pipe(filter(ready => ready)));

    // Re-check after auth is ready (authenticationService may have set it)
    if (this.clinicContextService.getSelectedClinicId() && this.clinicContextService.getSubscriptionId()) return;

    const email = this.authService.currentUserValue?.email;
    if (!email) return;

    try {
      const clinicIds = await this.authorizationService.getUserClinicIds(email);
      if (clinicIds.length > 0) {
        const subscriptionId = await this.authorizationService.getUserSubscriptionId(email).catch(() => null);
        this.clinicContextService.setClinicContext(clinicIds[0], subscriptionId);
        // Load clinic-specific timings
        await this.refreshTimeSlotsForClinic(clinicIds[0]);
      }
    } catch {
      // Non-critical — proceed without clinic context.
    }
  }

  // ── Dashboard doctor context ──

  private async initDashboardDoctorContext(): Promise<void> {
    const rawEmail = this.authService.currentUserValue?.email || '';
    this.doctorContextReady = false;

    try {
      if (rawEmail) {
        this.userRole = await this.authorizationService.getUserRole(rawEmail);
        this.permissions = await this.authorizationService.getUserPermissions(rawEmail);
      }
    } catch {
      this.userRole = 'doctor';
    }

    if (this.userRole === 'doctor') {
      // Doctor: use authenticated user's name from the database
      const currentUser = this.authService.currentUserValue;
      const dbName = currentUser?.name || '';
      const authEmail = rawEmail ? normalizeEmail(rawEmail) : '';

      // Build doctor entry from database user info
      if (dbName && authEmail) {
        const initials = dbName.split(' ').filter(Boolean).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
        const doctorEntry: DashboardDoctor = {
          id: `dr_${authEmail}`,
          name: dbName,
          specialty: '',
          avatar: initials,
          email: rawEmail
        };
        this.dashboardDoctors = [doctorEntry];
        this.selectedDashboardDoctorId = doctorEntry.id;
      } else {
        this.dashboardDoctors = [];
        this.selectedDashboardDoctorId = '';
      }
      this.selectedDashboardClinicId = this.clinicContextService.getSelectedClinicId() ?? '';
      // Load doctor's clinic list for the switcher
      await this.loadDoctorClinics();
    } else {
      // Receptionist: load clinics and doctors
      if (rawEmail) {
        try {
          const clinicIds = await this.authorizationService.getUserClinicIds(rawEmail);
          this.dashboardClinics = clinicIds.map(id => ({ id, label: `Clinic ${id}` }));
          this.selectedDashboardClinicId = clinicIds[0] ?? '';
        } catch {
          this.dashboardClinics = [];
          this.selectedDashboardClinicId = '';
        }
      }
      await this.refreshDashboardDoctors();
    }

    this.doctorContextReady = true;
    this.cdr.markForCheck();
  }

  /**
   * Load the list of clinics assigned to the current doctor.
   * Populates the clinic switcher dropdown only when more than 1 clinic.
   */
  private async loadDoctorClinics(): Promise<void> {
    const email = this.authService.currentUserValue?.email;
    if (!email) return;
    try {
      const clinicIds = await this.authorizationService.getUserClinicIds(email);
      this.doctorClinics = clinicIds.map(id => ({ id, label: `Clinic ${id}` }));
      this.selectedDoctorClinicId = this.clinicContextService.getSelectedClinicId() || clinicIds[0] || '';
      console.log(`🏥 Doctor clinics loaded: ${clinicIds.length} clinic(s)`, clinicIds);
    } catch {
      this.doctorClinics = [];
    }
    this.cdr.markForCheck();
  }

  /** Called when a doctor changes their active clinic from the switcher */
  async onDoctorClinicChange(): Promise<void> {
    if (!this.selectedDoctorClinicId) return;
    const email = this.authService.currentUserValue?.email;
    const subscriptionId = email
      ? await this.authorizationService.getUserSubscriptionId(email).catch(() => null)
      : null;
    this.clinicContextService.setClinicContext(this.selectedDoctorClinicId, subscriptionId);
    // Refresh time slots based on the new clinic's timings
    await this.refreshTimeSlotsForClinic(this.selectedDoctorClinicId);
    // Invalidate appointment cache so next load reflects new clinic
    this.appointmentService.invalidateCache();
    await this.loadAppointments();
    await this.loadPatientCount();
    if (this.selectedDate) {
      void this.loadSlotsForDate(this.selectedDate);
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

  private async refreshDashboardDoctors(): Promise<void> {
    if (this.selectedDashboardClinicId) {
      // Fetch doctors assigned to this specific clinic from the database
      this.dashboardDoctors = await this.authorizationService.getDoctorsForClinic(this.selectedDashboardClinicId) as DashboardDoctor[];
    } else {
      // Fetch all doctors in the subscription
      const subId = this.clinicContextService.getSubscriptionId();
      if (subId) {
        this.dashboardDoctors = await this.authorizationService.getDoctorsForSubscription(subId) as DashboardDoctor[];
      } else {
        this.dashboardDoctors = [];
      }
    }
    // Reset doctor selection when clinic changes
    this.selectedDashboardDoctorId = '';
    this.cdr.markForCheck();
  }

  get selectedDashboardDoctor(): DashboardDoctor | null {
    return this.dashboardDoctors.find(d => d.id === this.selectedDashboardDoctorId) ?? null;
  }

  /** Email of the currently selected dashboard doctor (normalized) */
  private get selectedDoctorEmail(): string {
    const doc = this.selectedDashboardDoctor;
    return doc?.email ? normalizeEmail(doc.email) : '';
  }

  async onDashboardClinicChange(): Promise<void> {
    this.selectedDashboardDoctorId = '';
    await this.refreshDashboardDoctors();
    // Re-calculate slots if a date is selected
    if (this.selectedDate) {
      void this.loadSlotsForDate(this.selectedDate);
    }
    this.cdr.markForCheck();
  }

  async onDashboardDoctorChange(): Promise<void> {
    // Close slot viewer when switching doctors
    this.showSlots = false;
    this.bookedSlotsForSelected = [];
    // Re-load slots for the selected date with new doctor filter
    if (this.selectedDate) {
      void this.loadSlotsForDate(this.selectedDate);
    }
    this.cdr.markForCheck();
  }

  private clearAddPatientQueryParams(): void {
    // Prevent re-opening Add Patient modal on browser refresh/back.
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        openAddPatient: null,
        name: null,
        phone: null,
        ailments: null
      }
    });
  }

  async loadAppointments(): Promise<void> {
    this.isLoadingAppts = true;
    try {
      this.appointments = await this.appointmentService.getAppointments();
    } catch (e) {
      this.appointments = [];
    }
    this.isLoadingAppts = false;
    this.cdr.detectChanges();
  }

  async loadPatientCount(): Promise<void> {
    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) return;
      const subId = this.clinicContextService.getSubscriptionId();
      if (!subId) return;
      const col = collection(this.db, 'patients');
      const clinicId = this.clinicContextService.getSelectedClinicId();
      const q = clinicId
        ? query(col, where('subscription_id', '==', subId), where('clinic_ids', 'array-contains', clinicId))
        : query(col, where('subscription_id', '==', subId));
      const snap = await getCountFromServer(q);
      this.totalPatients = snap.data().count;
      this.cdr.detectChanges();
    } catch (e) {
      this.totalPatients = 0;
    }
  }

  // ── Calendar helpers ──

  get calendarYear(): number { return this.calendarDate.getFullYear(); }
  get calendarMonth(): number { return this.calendarDate.getMonth(); }

  get calendarMonthLabel(): string {
    return this.calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  get calendarDays(): (Date | null)[] {
    const first = new Date(this.calendarYear, this.calendarMonth, 1);
    const last  = new Date(this.calendarYear, this.calendarMonth + 1, 0);
    const days: (Date | null)[] = [];
    const startDay = first.getDay();
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(this.calendarYear, this.calendarMonth, d));
    }
    return days;
  }

  /** Filter an appointment list by the selected dashboard doctor (if any) */
  private filterByDoctor(appts: Appointment[]): Appointment[] {
    const email = this.selectedDoctorEmail;
    if (!email) return appts;
    return appts.filter(a => normalizeEmail(a.doctor_id || '') === email);
  }

  appointmentsOnDate(date: Date): Appointment[] {
    return this.filterByDoctor(this.appointments.filter(a => {
      const d = new Date(a.datetime);
      return d.getFullYear() === date.getFullYear()
        && d.getMonth() === date.getMonth()
        && d.getDate() === date.getDate();
    }));
  }

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

  get todayAppointmentCount(): number {
    const t = new Date();
    return this.filterByDoctor(this.appointments.filter(a => {
      const d = new Date(a.datetime);
      return d.getFullYear() === t.getFullYear()
        && d.getMonth() === t.getMonth()
        && d.getDate() === t.getDate();
    })).length;
  }

  get thisMonthCount(): number {
    const t = new Date();
    return this.filterByDoctor(this.appointments.filter(a => {
      const d = new Date(a.datetime);
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
    })).length;
  }

  get selectedDateLabel(): string {
    if (!this.selectedDate) return '';
    return this.selectedDate.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  get selectedDateAppointments(): Appointment[] {
    if (!this.selectedDate) return [];
    return this.appointmentsOnDate(this.selectedDate);
  }

  // Used for slot availability: matches `loadSlotsForDate()` behavior
  // (cancelled appointments do not consume a slot).
  get selectedDateBookedAppointments(): Appointment[] {
    return this.selectedDateAppointments.filter(a => a.status !== 'cancelled');
  }

  prevMonth(): void {
    this.calendarDate = new Date(this.calendarYear, this.calendarMonth - 1, 1);
  }

  nextMonth(): void {
    this.calendarDate = new Date(this.calendarYear, this.calendarMonth + 1, 1);
  }

  onDayClick(date: Date): void {
    // If clicking a different date, close the slot viewer
    if (this.selectedDate && !this.isSelected(date)) {
      this.showSlots = false;
      this.bookedSlotsForSelected = [];
    }
    this.selectedDate = date;
    // Keep the "slots free" counter accurate even when the slot viewer is collapsed.
    void this.loadSlotsForDate(date);
    // Open Day View Modal
    this.openDayViewModal(date);
  }

  onPageClick(event: MouseEvent): void {
    // Deselect date when clicking anywhere outside the calendar/day panel
    if (this.selectedDate) {
      this.selectedDate = null;
      this.showSlots = false;
      this.bookedSlotsForSelected = [];
    }
  }

  bookOnDate(date: Date): void {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const params: any = { date: iso };
    if (this.selectedDashboardDoctorId) {
      params.doctorId = this.selectedDashboardDoctorId;
    }
    this.router.navigate(['/add-appointment'], { queryParams: params });
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  // ── Slot viewer ──

  generateTimeSlots(): string[] {
    // Kept for backward compatibility inside the component.
    // Main source of truth is now clinic-specific timings.
    return this.allTimeSlots;
  }

  /**
   * Fetch a clinic's schedule and regenerate time slots,
   * filtered by the selected doctor's weekday availability.
   * Falls back to global defaults when no clinic timings exist.
   */
  private async refreshTimeSlotsForClinic(clinicId?: string | null, date?: Date): Promise<void> {
    const id = clinicId || this.clinicContextService.getSelectedClinicId();
    if (!id) {
      this.allTimeSlots = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
      return;
    }
    try {
      const clinic = await this.clinicService.getClinicById(id);
      let timings = clinic?.schedule?.timings;

      const effectiveDate = date || this.selectedDate;

      // Check if the clinic is open on this day (based on schedule.weekdays)
      if (effectiveDate && clinic?.schedule?.weekdays) {
        if (!isClinicOpenOnDate(clinic.schedule.weekdays, effectiveDate)) {
          // Clinic is closed on this day — no slots available
          this.allTimeSlots = [];
          return;
        }
      }

      // Apply doctor availability filtering if a doctor and date are known
      const doctorEmail = this.selectedDoctorEmail;

      if (doctorEmail && effectiveDate && timings && timings.length > 0) {
        const availability = await this.authorizationService.getDoctorAvailability(doctorEmail, id);
        if (availability) {
          const dayKey = getWeekdayKey(effectiveDate);
          const dayLabels = availability[dayKey];
          // Pass true: availability map exists, so a missing day means "not available"
          timings = filterTimingsByAvailability(timings, dayLabels, true);
        }
      }

      this.allTimeSlots = generateTimeSlotsFromClinicTimings(timings);
    } catch {
      this.allTimeSlots = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
    }
  }

  formatSlotLabel(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${period}`;
  }

  /** True when the selected date is today */
  get isSelectedDateToday(): boolean {
    if (!this.selectedDate) return false;
    const now = new Date();
    return this.selectedDate.getFullYear() === now.getFullYear()
      && this.selectedDate.getMonth() === now.getMonth()
      && this.selectedDate.getDate() === now.getDate();
  }

  /** True when the selected date is strictly before today */
  get isSelectedDateInPast(): boolean {
    if (!this.selectedDate) return false;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selected = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate());
    return selected < todayStart;
  }

  /** True when the slot's time has already passed (only applies when viewing today) */
  isSlotInPast(slot: string): boolean {
    if (!this.selectedDate || !this.isSelectedDateToday) return false;
    const now = new Date();
    const [h, m] = slot.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return slotMinutes <= nowMinutes;
  }

  /** Only slots that are practically bookable (future + not booked) */
  get visibleTimeSlots(): string[] {
    // Past dates have no bookable slots at all
    if (this.isSelectedDateInPast) return [];
    return this.allTimeSlots.filter(s => !this.isSlotInPast(s));
  }

  get freeSlotCount(): number {
    return this.visibleTimeSlots.filter(s => !this.bookedSlotsForSelected.includes(s)).length;
  }

  async toggleSlots(): Promise<void> {
    this.showSlots = !this.showSlots;
    if (this.showSlots && this.selectedDate) {
      await this.loadSlotsForDate(this.selectedDate);
    }
  }

  private async loadSlotsForDate(date: Date): Promise<void> {
    this.isLoadingSlots = true;
    this.cdr.markForCheck();
    try {
      const all = this.appointments?.length
        ? this.appointments
        : await this.appointmentService.getAppointments();

      const doctorEmail = this.selectedDoctorEmail;

      this.bookedSlotsForSelected = all
        .filter(a => {
          const d = new Date(a.datetime);
          const sameDay = d.getFullYear() === date.getFullYear()
            && d.getMonth() === date.getMonth()
            && d.getDate() === date.getDate();
          const sameDoctor = doctorEmail
            ? normalizeEmail(a.doctor_id || '') === doctorEmail
            : true;
          return sameDay && sameDoctor && a.status !== 'cancelled';
        })
        .map(a => {
          const dt = new Date(a.datetime);
          return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        });
    } catch {
      this.bookedSlotsForSelected = [];
    }
    this.isLoadingSlots = false;
    this.cdr.markForCheck();
  }

  bookSpecificSlot(slot: string): void {
    if (!this.selectedDate) return;
    const y = this.selectedDate.getFullYear();
    const m = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(this.selectedDate.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const params: any = { date: iso, time: slot };
    if (this.selectedDashboardDoctorId) {
      params.doctorId = this.selectedDashboardDoctorId;
    }
    this.router.navigate(['/add-appointment'], { queryParams: params });
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // ── Search ──

  onSearchInput(): void {
    this.errorMessage = '';
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (!this.searchTerm.trim()) {
      this.patientService.clearSearchResults();
      this.isSearching = false;
      this.cdr.markForCheck();
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.isSearching = true;
      this.performSearch(this.searchTerm.trim());
    }, 1000);
  }

  private async performSearch(searchTerm: string): Promise<void> {
    if (!searchTerm) { this.patientService.clearSearchResults(); this.isSearching = false; return; }
    try {
      await this.patientService.searchPatients(searchTerm);
      this.errorMessage = this.searchResults.length === 0 ? 'No patients found' : '';
      this.isSearching = false;
    } catch (error) {
      this.errorMessage = 'Error searching for patients. Please try again.';
      this.isSearching = false;
    }
  }

  async onSearch(): Promise<void> {
    if (!this.searchTerm.trim()) { this.patientService.clearSearchResults(); return; }
    this.isSearching = true;
    await this.performSearch(this.searchTerm.trim());
  }

  openAddPatientForm(): void { this.uiStateService.openAddPatientForm(); }
  closeAddPatientForm(): void { this.uiStateService.closeAddPatientForm(); }

  async onPatientAdded(patientId: string): Promise<void> {
    this.uiStateService.closeAddPatientForm();
    await new Promise(resolve => setTimeout(resolve, 500));
    if (this.searchTerm.trim()) {
      await this.onSearch();
    } else {
      this.isSearching = true;
      await this.performSearch('');
    }
    this.loadPatientCount();
  }

  toggleFab(): void { this.uiStateService.toggleFab(); }
  closeFab(): void { this.uiStateService.closeFab(); }

  openAddVisitForm(patient: Patient): void {
    this.router.navigate(['/patient', patient.id, 'add-visit'], { state: { origin: 'home' } });
  }

  closeAddVisitForm(): void { this.uiStateService.closeAddVisitForm(); }
  toggleVisitEditMode(): void { this.uiStateService.toggleVisitEditMode(); }

  async onVisitAdded(patientId: string): Promise<void> {
    this.closeAddVisitForm();
    if (this.searchTerm.trim()) await this.onSearch();
  }

  viewPatientDetails(patient: Patient): void {
    this.clearSearch();
    this.router.navigate(['/patient', patient.id]);
  }

  async loadMoreResults(): Promise<void> { await this.patientService.loadMorePatients(); }

  clearSearch(): void {
    this.searchTerm = '';
    this.errorMessage = '';
    this.isSearching = false;
    this.patientService.clearSearchResults();
  }

  openAddAppointmentForm(patient?: Patient): void {
    if (patient) {
      this.router.navigate(['/add-appointment'], {
        queryParams: {
          patientId: patient.id,
          patientName: patient.name,
          patientPhone: patient.phone
        }
      });
      return;
    }
    this.router.navigate(['/add-appointment']);
  }
  closeAddAppointmentForm(): void { this.uiStateService.closeAddAppointmentForm(); }
  onAppointmentBooked(id: string): void {}

  // ═══════════════════════════════════════════
  //  Day View Modal
  // ═══════════════════════════════════════════

  async openDayViewModal(date: Date): Promise<void> {
    this.dayViewDate = date;
    this.showDayViewModal = true;
    this.isLoadingDayView = true;
    // Persist to sessionStorage
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    sessionStorage.setItem('home_dayViewDate', `${y}-${mo}-${d}`);
    this.cdr.detectChanges();

    // Refresh slots for the selected date (applies doctor availability)
    await this.refreshTimeSlotsForClinic(null, date);

    // Build data for the modal
    this.dayViewAppointments = this.appointmentsOnDate(date);
    this.dayViewBookedSlots = this.dayViewAppointments
      .filter(a => a.status !== 'cancelled')
      .map(a => {
        const dt = new Date(a.datetime);
        return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      });
    this.isLoadingDayView = false;
    this.cdr.detectChanges();
  }

  closeDayView(): void {
    this.showDayViewModal = false;
    this.dayViewDate = null;
    this.dayViewAppointments = [];
    this.dayViewBookedSlots = [];
    sessionStorage.removeItem('home_dayViewDate');
    this.cdr.detectChanges();
  }

  /** Restore day view modal state from sessionStorage (called after appointments load) */
  private restoreDayViewFromSession(): void {
    const saved = sessionStorage.getItem('home_dayViewDate');
    if (!saved) return;
    const [y, mo, d] = saved.split('-').map(Number);
    if (!y || !mo || !d) return;
    const date = new Date(y, mo - 1, d);
    this.selectedDate = date;
    this.openDayViewModal(date);
  }

  onDayViewBookSlot(time: string): void {
    if (!this.dayViewDate) return;
    this.closeDayView();
    this.bookSpecificSlot(time);
  }

  onDayViewAddVisit(appt: Appointment): void {
    this.closeDayView();
    const directPatientId = (appt.patient_id || '').trim();
    if (directPatientId) {
      this.router.navigate(['/patient', directPatientId, 'add-visit'], {
        state: { origin: 'home', appointmentId: appt.id || '' }
      });
    } else {
      this.router.navigate(['/home'], {
        queryParams: {
          openAddPatient: '1',
          name: appt.patientName || '',
          phone: appt.patientPhone || '',
          ailments: appt.ailments || ''
        }
      });
    }
  }

  onDayViewReschedule(appt: Appointment): void {
    // Close modal — the parent page handles reschedule modals differently
    // For doctor home, navigate to appointments page for full management
    this.closeDayView();
    this.router.navigate(['/appointments']);
  }

  onDayViewCancel(appt: Appointment): void {
    // Close modal and navigate to appointments for full management
    this.closeDayView();
    this.router.navigate(['/appointments']);
  }

  /** Whether the day view date is in the past */
  get isDayViewDateInPast(): boolean {
    if (!this.dayViewDate) return false;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selected = new Date(this.dayViewDate.getFullYear(), this.dayViewDate.getMonth(), this.dayViewDate.getDate());
    return selected < todayStart;
  }

  /** Doctor name for the day view */
  get dayViewDoctorName(): string {
    return this.selectedDashboardDoctor?.name || '';
  }
}