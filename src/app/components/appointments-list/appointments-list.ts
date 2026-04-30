// src/app/components/appointments-list/appointments-list.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { AlKanbanBoardComponent } from './al-kanban-board/al-kanban-board';
import { AppointmentService } from '../../services/appointmentService';
import { Appointment } from '../../models/appointment.model';
import { PatientService } from '../../services/patient';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { Patient } from '../../models/patient.model';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { AppointmentCleanupService } from '../../services/appointmentCleanupService';
import { todayLocalISO } from '../../utilities/local-date';
import { generateTimeSlotsFromConfig } from '../../utilities/timeSlotUtils';
import { normalizeEmail } from '../../utilities/normalize-email';
import { ClinicContextService } from '../../services/clinicContextService';
import { ClinicService } from '../../services/clinicService';
import { TimeSlotService } from '../../services/timeSlotService';
import { DoctorCacheService } from '../../services/doctorCacheService';
import { AutoCancelService } from '../../services/autoCancelService';
import { formatTime as sharedFormatTime, formatDate as sharedFormatDate, formatSlotLabel as sharedFormatSlotLabel, formatLocalDate as sharedFormatLocalDate, normalizePhoneDigits, isSameLocalDay, isToday as sharedIsToday, isFuture as sharedIsFuture } from '../../utilities/date-helpers';

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
  imports: [CommonModule, FormsModule, NavbarComponent, AlKanbanBoardComponent],
  templateUrl: './appointments-list.html',
  styleUrl: './appointments-list.css',
  encapsulation: ViewEncapsulation.None
})
export class AppointmentsListComponent implements OnInit, OnDestroy {
  appointments: Appointment[] = [];
  isLoading = true;
  errorMessage = '';

  // Bound function reference for child component
  getDoctorDisplayNameFn = (appt: Appointment): string => this.getDoctorDisplayName(appt);

  // Date filter — defaults to today
  selectedDate: string = todayLocalISO();

  readonly appointmentsDateMin: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMin;
  readonly appointmentsDateMax: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMax;

  // Search
  searchTerm: string = '';

  updatingId: string | null = null;

  // Permission flags
  canAppointment = false;
  canCancel = false;
  userRole: 'doctor' | 'receptionist' = 'doctor';

  // Doctor name cache for display
  private doctorNameCache = new Map<string, string>();

  // Cancel modal state
  showCancelModal = false;
  cancellingAppt: Appointment | null = null;
  cancelReason = '';
  isCancelling = false;
  cancelError = '';

  // Drag-and-drop state
  draggingAppt: Appointment | null = null;
  dragOverColumn: string | null = null;

  // ── Postpone Modal State ──
  showPostponeModal = false;
  postponingAppt: Appointment | null = null;
  postponeDate: string = '';
  postponeTime: string = '';
  postponeBookedSlots: string[] = [];
  isLoadingPostponeSlots = false;
  isPostponing = false;
  postponeError = '';
  allTimeSlots: string[] = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
  readonly postponeMinDate: string = todayLocalISO();
  readonly postponeMaxDate: string = DEFAULT_SYSTEM_SETTINGS.addAppointment.maxDate;

  private appointmentService = inject(AppointmentService);
  private patientService = inject(PatientService);
  private authService = inject(AuthenticationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private cleanupService = inject(AppointmentCleanupService);
  private clinicContextService = inject(ClinicContextService);
  private clinicService = inject(ClinicService);
  private authorizationService = inject(AuthorizationService);
  private timeSlotService = inject(TimeSlotService);
  private doctorCacheService = inject(DoctorCacheService);
  private autoCancelService = inject(AutoCancelService);

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private autoCancelCleanup: (() => void) | null = null;

  readonly columns: KanbanColumn[] = [
    { id: 'scheduled',  label: 'Scheduled',  color: '#E7F5F7', accent: '#148D9E', icon: 'clock'    },
    { id: 'completed',  label: 'Completed',  color: '#E7F5F7', accent: '#1CB5C9', icon: 'check'    },
    { id: 'cancelled',  label: 'Cancelled',  color: '#fee2e2', accent: '#ef4444', icon: 'x'        },
  ];

  get filteredAppointments(): Appointment[] {
    let result = this.appointments;

    // Always respect the date filter (defaults to today).
    if (this.selectedDate) {
      const [y, mo, day] = this.selectedDate.split('-').map(Number);
      result = result.filter(a => {
        const d = new Date(a.datetime);
        return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
      });
    }

    const termRaw = this.searchTerm.trim();
    const term = termRaw.toLowerCase();
    if (term) {
      const digitsQuery = normalizePhoneDigits(termRaw);
      result = result.filter(a => {
        const name = (a.patientName ?? '').toLowerCase();
        const ailments = (a.ailments ?? '').toLowerCase();
        const phoneDigits = normalizePhoneDigits(a.patientPhone ?? '');

        const matchesNameOrAilments = name.includes(term) || ailments.includes(term);
        const matchesPhoneDigits = digitsQuery ? phoneDigits.includes(digitsQuery) : false;
        const matchesPhoneRaw = (a.patientPhone ?? '').includes(termRaw);

        return matchesNameOrAilments || matchesPhoneDigits || matchesPhoneRaw;
      });
    }

    return result;
  }

  cardsFor(status: Appointment['status']): Appointment[] {
    return this.filteredAppointments.filter(a => a.status === status);
  }

  get totalToday(): number {
    const t = new Date();
    return this.appointments.filter(a => {
      const d = new Date(a.datetime);
      return d.getFullYear() === t.getFullYear()
        && d.getMonth() === t.getMonth()
        && d.getDate() === t.getDate();
    }).length;
  }

  get isSelectedToday(): boolean {
    return this.selectedDate === todayLocalISO();
  }

  goToday(): void {
    this.selectedDate = todayLocalISO();
  }

  goToPrevDate(): void {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    this.selectedDate = this.formatLocalDate(prev);
  }

  goToNextDate(): void {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    this.selectedDate = this.formatLocalDate(next);
  }

  /** Format a Date to YYYY-MM-DD local string */
  private formatLocalDate(date: Date): string {
    return sharedFormatLocalDate(date);
  }

  /** Formatted display label for the selected date (e.g. "19 Apr 2026") */
  get selectedDateLabel(): string {
    const [y, m, d] = this.selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  onDateInput(value: string): void {
    if (!value) return;
    const year = parseInt(value.split('-')[0], 10);
    if (year < 2000 || year > 2099) {
      this.selectedDate = todayLocalISO();
    } else {
      this.selectedDate = value;
    }
  }

  async ngOnInit(): Promise<void> {
    // Ensure clinic/subscription context is resolved before fetching appointments
    await this.ensureClinicContext();

    // Guard: if subscription context is still missing after best-effort resolution,
    // show a friendly error instead of crashing.
    if (!this.clinicContextService.getSubscriptionId()) {
      this.errorMessage = 'Your account is not linked to any clinic subscription. Please contact your administrator.';
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    // Resolve permissions for the current user
    await this.loadPermissions();

    // Build doctor name cache for card display
    await this.initDoctorCache();

    try {
      this.appointments = await this.appointmentService.getAppointments();
    } catch (e) {
      this.errorMessage = 'Failed to load appointments.';
      this.appointments = [];
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }

    // Load clinic-specific timings for the postpone modal
    await this.refreshTimeSlotsForClinic();

    // Auto-cancel appointments from past dates that are still "scheduled"
    await this.autoCancelService.autoCancelPastAppointments(this.appointments);
    this.cdr.detectChanges();

    // Auto-advance to next day if today's slots are exhausted and no scheduled appointments remain
    this.autoAdvanceDateIfNeeded();

    this.autoCancelCleanup = this.autoCancelService.scheduleAtCutoff(
      () => this.appointments,
      () => this.cdr.detectChanges()
    );
    // Keep UI in sync when appointments are updated from other screens (e.g. adding a visit).
    this.refreshTimer = setInterval(() => {
      void this.refreshAppointments();
    }, 3000);

    // Auto-cleanup first-time patients with no visits (runs once per session).
    void this.cleanupService.runCleanupIfNeeded();
  }

  ngOnDestroy(): void {
    if (this.autoCancelCleanup) this.autoCancelCleanup();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async refreshAppointments(): Promise<void> {
    // Guard: skip if subscription context is not available yet
    if (!this.clinicContextService.getSubscriptionId()) return;
    try {
      this.appointments = await this.appointmentService.getAppointments();
      this.cdr.detectChanges();
    } catch {
      // No-op: avoid breaking UI refresh loop
    }
  }

  // Auto-cancel logic is now handled by AutoCancelService


  async updateStatus(appt: Appointment, status: Appointment['status']): Promise<void> {
    if (appt.status === status || this.updatingId === appt.id) return;
    if (status === 'completed') {
      this.errorMessage = 'Appointments are completed automatically when a visit is added.';
      this.cdr.detectChanges();
      return;
    }
    if (status === 'cancelled') {
      this.openCancelModal(appt);
      return;
    }
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

  // ── Cancel Appointment Modal ──

  openCancelModal(appt: Appointment): void {
    this.cancellingAppt = appt;
    this.cancelReason = '';
    this.cancelError = '';
    this.isCancelling = false;
    this.showCancelModal = true;
    this.cdr.detectChanges();
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
    this.cancellingAppt = null;
    this.cancelReason = '';
    this.cancelError = '';
    this.isCancelling = false;
    this.cdr.detectChanges();
  }

  async confirmCancel(): Promise<void> {
    if (!this.cancellingAppt?.id) return;
    const reason = this.cancelReason.trim();
    if (!reason) {
      this.cancelError = 'Please provide a reason for cancellation.';
      this.cdr.detectChanges();
      return;
    }
    this.isCancelling = true;
    this.cancelError = '';
    this.cdr.detectChanges();

    const apptId = this.cancellingAppt.id;

    try {
      // Wrap in a timeout so the UI doesn't get stuck if Firestore hangs
      const cancelPromise = this.appointmentService.cancelAppointment(apptId, reason);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Cancel request timed out')), 10000)
      );
      await Promise.race([cancelPromise, timeoutPromise]);

      // Success — update local state and close
      if (this.cancellingAppt) {
        this.cancellingAppt.status = 'cancelled';
        this.cancellingAppt.cancellationReason = reason;
      }
      this.closeCancelModal();
    } catch (err: any) {
      this.cancelError = err?.message === 'Cancel request timed out'
        ? 'Request timed out. Please check your connection and try again.'
        : 'Failed to cancel appointment. Please try again.';
    } finally {
      this.isCancelling = false;
      this.cdr.detectChanges();
    }
  }

  // ═══════════════════════════════════════════
  //  POSTPONE (Reschedule) Modal
  // ═══════════════════════════════════════════

  openPostponeModal(appt: Appointment): void {
    this.postponingAppt = appt;
    this.postponeTime = '';
    this.postponeBookedSlots = [];
    this.postponeError = '';
    this.isPostponing = false;
    this.showPostponeModal = true;

    // Default to tomorrow's date and load slots (async — UI updates when done)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    this.postponeDate = `${y}-${m}-${d}`;
    void this.computePostponeBookedSlots();
    this.cdr.detectChanges();
  }

  cancelPostpone(): void {
    this.showPostponeModal = false;
    this.postponingAppt = null;
    this.postponeDate = '';
    this.postponeTime = '';
    this.postponeBookedSlots = [];
    this.postponeError = '';
    this.cdr.detectChanges();
  }

  /** True when the slot is in the past for the selected postpone date */
  isPostponeSlotInPast(slot: string): boolean {
    if (!this.postponeDate) return false;
    const today = new Date();
    const [y, mo, day] = this.postponeDate.split('-').map(Number);
    const isToday = today.getFullYear() === y && today.getMonth() === mo - 1 && today.getDate() === day;
    if (!isToday) return false;
    const [h, m] = slot.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    return slotMinutes <= nowMinutes;
  }

  get postponeAvailableSlots(): string[] {
    return this.allTimeSlots.filter(s => !this.postponeBookedSlots.includes(s) && !this.isPostponeSlotInPast(s));
  }

  /** True if the selected postpone date is strictly before today */
  isPostponeDateInPast(): boolean {
    if (!this.postponeDate) return false;
    const today = todayLocalISO();
    return this.postponeDate < today;
  }

  onPostponeDateChange(): void {
    this.postponeTime = '';
    this.postponeError = '';
    if (!this.postponeDate) {
      this.postponeBookedSlots = [];
      return;
    }
    // Reject past dates
    if (this.isPostponeDateInPast()) {
      this.postponeBookedSlots = [];
      this.postponeError = 'Cannot postpone to a past date. Please select today or a future date.';
      this.cdr.detectChanges();
      return;
    }
    void this.computePostponeBookedSlots();
  }

  /**
   * Compute booked slots from ALL appointments across clinics.
   * This prevents a doctor from being double-booked at different clinics
   * for the same time slot.
   */
  private async computePostponeBookedSlots(): Promise<void> {
    const appt = this.postponingAppt;
    const doctorEmail = appt?.doctor_id ? normalizeEmail(appt.doctor_id) : '';
    const [y, mo, day] = this.postponeDate.split('-').map(Number);

    try {
      const allAppointments = await this.appointmentService.getAllAppointments();
      this.postponeBookedSlots = allAppointments
        .filter(a => {
          const d = new Date(a.datetime);
          const sameDay = d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
          const sameDoctor = doctorEmail ? normalizeEmail(a.doctor_id || '') === doctorEmail : true;
          return sameDay && sameDoctor && a.status !== 'cancelled' && a.id !== appt?.id;
        })
        .map(a => {
          const dt = new Date(a.datetime);
          return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        });
    } catch {
      this.postponeBookedSlots = [];
    }
    this.cdr.detectChanges();
  }

  async submitPostpone(): Promise<void> {
    if (!this.postponingAppt?.id || !this.postponeDate || !this.postponeTime) {
      this.postponeError = 'Please select a date and time slot.';
      return;
    }
    // Final guard: reject past date
    if (this.isPostponeDateInPast()) {
      this.postponeError = 'Cannot postpone to a past date. Please select today or a future date.';
      return;
    }
    // Final guard: reject past time slot on today
    if (this.isPostponeSlotInPast(this.postponeTime)) {
      this.postponeError = 'This time slot has already passed. Please select a future time.';
      this.postponeTime = '';
      return;
    }
    // Optimistic update: patch local state instantly so the UI feels snappy
    const newDate = new Date(this.postponeDate + 'T00:00:00');
    const newTime = this.postponeTime;
    const apptId = this.postponingAppt.id;

    this.postponingAppt.datetime = newDate;
    this.cancelPostpone();             // closes modal immediately
    this.cdr.detectChanges();

    // Fire Firestore write in the background (no await — UI is already updated)
    this.appointmentService.postponeAppointment(apptId, newDate, newTime)
      .then(() => this.refreshAppointments())
      .catch(() => {
        // On rare failure, a background refresh will re-sync within 3 s.
        console.error('Postpone write failed – will re-sync on next refresh.');
      });
  }

  formatSlotLabel(time: string): string {
    return sharedFormatSlotLabel(time);
  }

  /**
   * Fetch the current clinic's schedule and regenerate time slots.
   * Falls back to global defaults when no clinic timings exist.
   */
  private async refreshTimeSlotsForClinic(): Promise<void> {
    this.allTimeSlots = await this.timeSlotService.getTimeSlotsForClinic();
  }

  /**
   * Ensure subscription + clinic context is set before any Firestore queries.
   * Waits for auth to be ready, then resolves from the logged-in user's email
   * → clinic_users → subscription_id.
   */
  private async ensureClinicContext(): Promise<void> {
    // Already set (from login or localStorage) — nothing to do.
    if (this.clinicContextService.getSubscriptionId()) return;

    // Wait for Firebase auth to resolve before reading user email
    await firstValueFrom(this.authService.authReady$.pipe(filter(ready => ready)));

    // Re-check after auth is ready (it may have been set by authenticationService)
    if (this.clinicContextService.getSubscriptionId()) return;

    const email = this.authService.currentUserValue?.email;
    if (!email) return;

    try {
      const clinicIds = await this.authorizationService.getUserClinicIds(email);
      const subscriptionId = await this.authorizationService.getUserSubscriptionId(email).catch(() => null);
      if (clinicIds.length > 0 || subscriptionId) {
        this.clinicContextService.setClinicContext(
          clinicIds[0] || null,
          subscriptionId
        );
      }
    } catch {
      // Non-critical — proceed without; requireSubscriptionId will throw if truly missing.
    }
  }

  goHome(): void { this.router.navigate(['/home']); }
  bookNew(): void { this.router.navigate(['/add-appointment'], { queryParams: { from: 'appointments' } }); }

  // ── Drag-and-Drop ──

  onDragStart(event: DragEvent, appt: Appointment): void {
    if (appt.status !== 'scheduled') {
      event.preventDefault();
      return;
    }
    this.draggingAppt = appt;
    // Store appointment id in the transfer data
    event.dataTransfer?.setData('text/plain', appt.id || '');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragEnd(): void {
    this.draggingAppt = null;
    this.dragOverColumn = null;
    this.cdr.detectChanges();
  }

  onColumnDragOver(event: DragEvent, columnId: string): void {
    // Only allow drop on the cancelled column
    if (columnId !== 'cancelled' || !this.draggingAppt) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverColumn = columnId;
  }

  onColumnDragEnter(event: DragEvent, columnId: string): void {
    if (columnId !== 'cancelled' || !this.draggingAppt) return;
    event.preventDefault();
    this.dragOverColumn = columnId;
    this.cdr.detectChanges();
  }

  onColumnDragLeave(event: DragEvent, columnId: string): void {
    // Only clear if we're actually leaving the column (not entering a child)
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
    if (this.dragOverColumn === columnId) {
      this.dragOverColumn = null;
      this.cdr.detectChanges();
    }
  }

  onColumnDrop(event: DragEvent, columnId: string): void {
    event.preventDefault();
    this.dragOverColumn = null;

    if (columnId !== 'cancelled' || !this.draggingAppt) {
      this.draggingAppt = null;
      this.cdr.detectChanges();
      return;
    }

    const appt = this.draggingAppt;
    this.draggingAppt = null;

    // Only scheduled appointments can be cancelled
    if (appt.status === 'scheduled') {
      this.openCancelModal(appt);
    }
    this.cdr.detectChanges();
  }

  // ── Doctor name helpers ──

  /** Build doctor name cache using DoctorCacheService */
  private async initDoctorCache(): Promise<void> {
    await this.doctorCacheService.buildCache();
    // Sync local cache reference
    for (const doc of this.doctorCacheService.getAllDoctors()) {
      this.doctorNameCache.set(normalizeEmail(doc.email), doc.name);
    }
  }

  /** Resolve doctor display name from the doctor_id (email) stored on the appointment */
  getDoctorDisplayName(appt: Appointment): string {
    return this.doctorCacheService.getDoctorDisplayName(appt);
  }

  /**
   * Auto-advance to next day if:
   * 1. Currently viewing today
   * 2. All time slots have passed (current time > last slot)
   * 3. No scheduled appointments remain for today
   */
  private autoAdvanceDateIfNeeded(): void {
    if (!this.isSelectedToday) return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Check if all slots have passed
    if (this.allTimeSlots.length > 0) {
      const lastSlot = this.allTimeSlots[this.allTimeSlots.length - 1];
      const [lh, lm] = lastSlot.split(':').map(Number);
      const lastSlotMinutes = lh * 60 + lm;
      if (nowMinutes <= lastSlotMinutes) return; // Still have slots remaining today
    }

    // Check if there are any scheduled appointments remaining for today
    const todayScheduled = this.appointments.filter(a => {
      if (a.status !== 'scheduled') return false;
      const d = new Date(a.datetime);
      return d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
    });

    if (todayScheduled.length === 0) {
      // All slots exhausted and no scheduled appointments — advance to tomorrow
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      this.selectedDate = this.formatLocalDate(tomorrow);
      this.cdr.detectChanges();
    }
  }

  private async loadPermissions(): Promise<void> {
    const email = this.authService.currentUserValue?.email;
    if (!email) return;
    try {
      const perms = await this.authorizationService.getUserPermissions(email);
      this.canAppointment = perms.canAppointment;
      this.canCancel = perms.canCancel;
      this.userRole = await this.authorizationService.getUserRole(email);
      this.cdr.detectChanges();
    } catch {
      // Default to false (no permissions) on failure
    }
  }

  async openVisitFromAppointment(appt: Appointment): Promise<void> {
    const directPatientId = (appt.patient_id || '').trim();
    if (directPatientId) {
      if (appt.ailments && appt.ailments.trim()) {
        try {
          await this.patientService.updatePatient(directPatientId, { ailments: appt.ailments });
        } catch {
          // Don't block navigation if the update fails.
        }
      }
      this.router.navigate(['/patient', directPatientId, 'add-visit'], { state: { origin: 'appointments' } });
      return;
    }

    // No existing patient link -> open Add Patient with prefilled values
    this.router.navigate(['/home'], {
      queryParams: {
        openAddPatient: '1',
        name: appt.patientName || '',
        phone: appt.patientPhone || '',
        ailments: appt.ailments || ''
      }
    });
  }

  formatDate(date: Date): string {
    return sharedFormatDate(date);
  }

  formatTime(time: Date | string): string {
    return sharedFormatTime(time);
  }

  isToday(date: Date): boolean {
    return sharedIsToday(new Date(date));
  }

  isFuture(date: Date): boolean {
    return sharedIsFuture(date);
  }
}