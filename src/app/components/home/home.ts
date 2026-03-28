import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import {
  Firestore, collection, query, where, getCountFromServer
} from '@angular/fire/firestore';
import { PatientService } from '../../services/patient';
import { UIStateService } from '../../services/uiStateService';
import { AppointmentService } from '../../services/appointmentService';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { ClinicContextService } from '../../services/clinicContextService';
import { Patient } from '../../models/patient.model';
import { Appointment } from '../../models/appointment.model';
import { AddPatientComponent } from '../add-patient/add-patient';
import { NavbarComponent } from '../navbar/navbar';
import { MomentDatePipe } from '../../pipes/moment-date.pipe';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { generateTimeSlotsFromConfig } from '../../utilities/timeSlotUtils';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AddPatientComponent, NavbarComponent, MomentDatePipe],
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

  // Slot viewer
  showSlots: boolean = false;
  bookedSlotsForSelected: string[] = [];
  isLoadingSlots: boolean = false;
  readonly allTimeSlots: string[] = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);

  get hasMoreResults(): boolean { return this.patientService.hasMoreResults; }
  get isLoadingMore(): boolean { return this.patientService.isLoadingMore; }

  private searchTimeout: any;

  // Prefill for Add Patient (used from appointment cards)
  addPatientPrefillName: string = '';
  addPatientPrefillPhone: string = '';
  addPatientPrefillAilments: string = '';

  constructor(
    private patientService: PatientService,
    private uiStateService: UIStateService,
    private appointmentService: AppointmentService,
    private authService: AuthenticationService,
    private authorizationService: AuthorizationService,
    private clinicContextService: ClinicContextService,
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
    // Ensure doctor's clinic context is resolved so AddPatient uses the correct clinicId.
    void this.ensureClinicContext();

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
    this.loadAppointments();
    this.loadPatientCount();
  }

  /**
   * Ensure the doctor's clinic context is set so patients created
   * from Add-Patient modal are associated with the correct clinic
   * and visible to reception staff.
   */
  private async ensureClinicContext(): Promise<void> {
    // Already set (from login or localStorage) — nothing to do.
    if (this.clinicContextService.getSelectedClinicId()) return;

    const email = this.authService.currentUserValue?.email;
    if (!email) return;

    try {
      const clinicIds = await this.authorizationService.getUserClinicIds(email);
      if (clinicIds.length > 0) {
        const subscriptionId = await this.authorizationService.getUserSubscriptionId(email).catch(() => null);
        this.clinicContextService.setClinicContext(clinicIds[0], subscriptionId);
      }
    } catch {
      // Non-critical — proceed without clinic context.
    }
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
      const col = collection(this.db, 'patients');
      const clinicId = this.clinicContextService.getSelectedClinicId();
      // Count all patients in the clinic (includes those created by any staff member).
      const q = clinicId
        ? query(col, where('clinicId', '==', clinicId))
        : query(col, where('userId', '==', userId));
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

  appointmentsOnDate(date: Date): Appointment[] {
    return this.appointments.filter(a => {
      const d = new Date(a.appointmentDate);
      return d.getFullYear() === date.getFullYear()
        && d.getMonth() === date.getMonth()
        && d.getDate() === date.getDate();
    });
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
    return this.appointments.filter(a => {
      const d = new Date(a.appointmentDate);
      return d.getFullYear() === t.getFullYear()
        && d.getMonth() === t.getMonth()
        && d.getDate() === t.getDate();
    }).length;
  }

  get thisMonthCount(): number {
    const t = new Date();
    return this.appointments.filter(a => {
      const d = new Date(a.appointmentDate);
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
    }).length;
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
    const iso = date.toISOString().split('T')[0];
    this.router.navigate(['/add-appointment'], { queryParams: { date: iso } });
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  // ── Slot viewer ──

  generateTimeSlots(): string[] {
    // Kept for backward compatibility inside the component.
    // Main source of truth is now DEFAULT_SYSTEM_SETTINGS.
    return generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
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
      // Use already-loaded appointments when available to avoid extra network calls.
      const all = this.appointments?.length
        ? this.appointments
        : await this.appointmentService.getAppointments();

      this.bookedSlotsForSelected = all
        .filter(a => {
          const d = new Date(a.appointmentDate);
          return d.getFullYear() === date.getFullYear()
            && d.getMonth() === date.getMonth()
            && d.getDate() === date.getDate()
            && a.status !== 'cancelled';
        })
        .map(a => a.appointmentTime);
    } catch {
      this.bookedSlotsForSelected = [];
    }
    this.isLoadingSlots = false;
    this.cdr.markForCheck();
  }

  bookSpecificSlot(slot: string): void {
    if (!this.selectedDate) return;
    const iso = this.selectedDate.toISOString().split('T')[0];
    this.router.navigate(['/add-appointment'], { queryParams: { date: iso, time: slot } });
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
    this.router.navigate(['/patient', patient.uniqueId, 'add-visit'], { state: { origin: 'home' } });
  }

  closeAddVisitForm(): void { this.uiStateService.closeAddVisitForm(); }
  toggleVisitEditMode(): void { this.uiStateService.toggleVisitEditMode(); }

  async onVisitAdded(patientId: string): Promise<void> {
    this.closeAddVisitForm();
    if (this.searchTerm.trim()) await this.onSearch();
  }

  viewPatientDetails(patient: Patient): void {
    this.clearSearch();
    this.router.navigate(['/patient', patient.uniqueId]);
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
          patientId: patient.uniqueId,
          patientName: patient.name,
          patientPhone: patient.phone,
          patientFamilyId: patient.familyId
        }
      });
      return;
    }
    this.router.navigate(['/add-appointment']);
  }
  closeAddAppointmentForm(): void { this.uiStateService.closeAddAppointmentForm(); }
  onAppointmentBooked(id: string): void {}
}