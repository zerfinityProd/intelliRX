// src/app/components/appointments-list/appointments-list.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { AppointmentService } from '../../services/appointmentService';
import { Appointment } from '../../models/appointment.model';
import { PatientService } from '../../services/patient';
import { FirebaseService } from '../../services/firebase';
import { AuthenticationService } from '../../services/authenticationService';
import { Patient } from '../../models/patient.model';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { AppointmentCleanupService } from '../../services/appointmentCleanupService';
import { todayLocalISO } from '../../utilities/local-date';
import { generateTimeSlotsFromConfig } from '../../utilities/timeSlotUtils';
import { normalizeEmail } from '../../utilities/normalize-email';

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
export class AppointmentsListComponent implements OnInit, OnDestroy {
  appointments: Appointment[] = [];
  isLoading = true;
  errorMessage = '';

  // Date filter — defaults to today
  selectedDate: string = todayLocalISO();

  readonly appointmentsDateMin: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMin;
  readonly appointmentsDateMax: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMax;

  // Search
  searchTerm: string = '';

  updatingId: string | null = null;

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
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthenticationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private cleanupService = inject(AppointmentCleanupService);

  private autoCancelTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly columns: KanbanColumn[] = [
    { id: 'scheduled',  label: 'Scheduled',  color: '#ede9fe', accent: '#6366f1', icon: 'clock'    },
    { id: 'completed',  label: 'Completed',  color: '#d1fae5', accent: '#10b981', icon: 'check'    },
    { id: 'cancelled',  label: 'Cancelled',  color: '#fee2e2', accent: '#ef4444', icon: 'x'        },
  ];

  get filteredAppointments(): Appointment[] {
    let result = this.appointments;

    // Always respect the date filter (defaults to today).
    if (this.selectedDate) {
      const [y, mo, day] = this.selectedDate.split('-').map(Number);
      result = result.filter(a => {
        const d = new Date(a.appointmentDate);
        return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
      });
    }

    const termRaw = this.searchTerm.trim();
    const term = termRaw.toLowerCase();
    if (term) {
      const digitsQuery = this.normalizePhoneDigits(termRaw);
      result = result.filter(a => {
        const name = (a.patientName ?? '').toLowerCase();
        const ailments = (a.ailments ?? '').toLowerCase();
        const phoneDigits = this.normalizePhoneDigits(a.patientPhone ?? '');

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
      const d = new Date(a.appointmentDate);
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
    try {
      this.appointments = await this.appointmentService.getAppointments();
    } catch (e) {
      this.errorMessage = 'Failed to load appointments.';
      this.appointments = [];
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }

    // Auto-cancel appointments from past dates that are still "scheduled"
    await this.autoCancelPastAppointments();

    this.scheduleAutoCancelAtCutoff();
    // Keep UI in sync when appointments are updated from other screens (e.g. adding a visit).
    this.refreshTimer = setInterval(() => {
      void this.refreshAppointments();
    }, 3000);

    // Auto-cleanup first-time patients with no visits (runs once per session).
    void this.cleanupService.runCleanupIfNeeded();
  }

  ngOnDestroy(): void {
    if (this.autoCancelTimer) clearTimeout(this.autoCancelTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async refreshAppointments(): Promise<void> {
    try {
      this.appointments = await this.appointmentService.getAppointments();
      this.cdr.detectChanges();
    } catch {
      // No-op: avoid breaking UI refresh loop
    }
  }

  private scheduleAutoCancelAtCutoff(): void {
    if (this.autoCancelTimer) clearTimeout(this.autoCancelTimer);

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(
      DEFAULT_SYSTEM_SETTINGS.autoCancelAt.hour,
      DEFAULT_SYSTEM_SETTINGS.autoCancelAt.minute,
      0,
      0
    );

    const delay = cutoff.getTime() - now.getTime();
    if (delay <= 0) {
      void this.runAutoCancel();
      return;
    }
    this.autoCancelTimer = setTimeout(() => void this.runAutoCancel(), delay);
  }

  private isSameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  private normalizePhoneDigits(phone: string): string {
    return String(phone || '').replace(/\D/g, '');
  }

  private async hasAnyVisitTodayForAppointment(appt: Appointment, today: Date, cache: Map<string, boolean>): Promise<boolean> {
    const cacheKey = appt.patientId
      ? `pid:${appt.patientId}`
      : `np:${(appt.patientName || '').trim().toLowerCase()}|${this.normalizePhoneDigits(appt.patientPhone || '')}`;

    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    const checkVisitsForPatientId = async (patientId: string): Promise<boolean> => {
      const visits = await this.patientService.getPatientVisits(patientId);
      return visits.some(v => this.isSameLocalDay(new Date((v as any).createdAt), today));
    };

    let result = false;
    try {
      if (appt.patientId) {
        result = await checkVisitsForPatientId(appt.patientId);
      } else {
        const userId = this.authService.getCurrentUserId();
        if (!userId) {
          result = false;
        } else {
          const phoneDigits = this.normalizePhoneDigits(appt.patientPhone || '');
          if (!phoneDigits) {
            result = false;
          } else {
            const { results } = await this.firebaseService.searchPatientByPhone(phoneDigits, userId);
            const nameLower = (appt.patientName || '').trim().toLowerCase();
            const candidates = results.filter(p =>
              (p.name || '').trim().toLowerCase() === nameLower &&
              this.normalizePhoneDigits((p as any).phone) === phoneDigits
            );
            for (const p of candidates) {
              if (await checkVisitsForPatientId(p.uniqueId)) {
                result = true;
                break;
              }
            }
          }
        }
      }
    } catch {
      result = false;
    }

    cache.set(cacheKey, result);
    return result;
  }

  private async runAutoCancel(): Promise<void> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const cache = new Map<string, boolean>();
    const todaysScheduled = this.appointments.filter(a =>
      a.status === 'scheduled' && this.isSameLocalDay(new Date(a.appointmentDate), now)
    );

    for (const appt of todaysScheduled) {
      if (!appt.id) continue;
      const hasVisitToday = await this.hasAnyVisitTodayForAppointment(appt, now, cache);
      if (!hasVisitToday) {
        try {
          await this.appointmentService.updateAppointmentStatus(appt.id, 'cancelled');
          appt.status = 'cancelled';
        } catch {
          // keep going
        }
      }
    }

    this.cdr.detectChanges();
  }

  /**
   * Auto-cancel all past-date appointments that are still 'scheduled'.
   * If the appointment day has fully passed, the patient didn't show up.
   */
  private async autoCancelPastAppointments(): Promise<void> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const pastScheduled = this.appointments.filter(a => {
      if (a.status !== 'scheduled') return false;
      const apptDate = new Date(a.appointmentDate);
      const apptDay = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
      return apptDay < todayStart; // strictly before today
    });

    if (pastScheduled.length === 0) return;

    for (const appt of pastScheduled) {
      if (!appt.id) continue;
      try {
        await this.appointmentService.updateAppointmentStatus(appt.id, 'cancelled');
        appt.status = 'cancelled';
        console.log(`🕐 Auto-cancelled past appointment: ${appt.patientName} (${new Date(appt.appointmentDate).toLocaleDateString()})`);
      } catch {
        // keep going
      }
    }

    this.cdr.detectChanges();
  }


  async updateStatus(appt: Appointment, status: Appointment['status']): Promise<void> {
    if (appt.status === status || this.updatingId === appt.id) return;
    if (status === 'completed') {
      this.errorMessage = 'Appointments are completed automatically when a visit is added.';
      this.cdr.detectChanges();
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

    // Default to tomorrow's date and instantly load slots
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    this.postponeDate = `${y}-${m}-${d}`;
    this.computePostponeBookedSlots();
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
    this.computePostponeBookedSlots();
    this.cdr.detectChanges();
  }

  /** Compute booked slots instantly from already-loaded appointments (no Firestore fetch). */
  private computePostponeBookedSlots(): void {
    const appt = this.postponingAppt;
    const doctorEmail = appt?.doctorId ? normalizeEmail(appt.doctorId) : '';
    const clinicId = appt?.clinicId || '';
    const [y, mo, day] = this.postponeDate.split('-').map(Number);

    this.postponeBookedSlots = this.appointments
      .filter(a => {
        const d = new Date(a.appointmentDate);
        const sameDay = d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
        const sameDoctor = doctorEmail ? normalizeEmail(a.doctorId || '') === doctorEmail : true;
        const sameClinic = clinicId ? (a.clinicId ? a.clinicId === clinicId : true) : true;
        return sameDay && sameDoctor && sameClinic && a.status !== 'cancelled' && a.id !== appt?.id;
      })
      .map(a => a.appointmentTime);
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

    this.postponingAppt.appointmentDate = newDate;
    this.postponingAppt.appointmentTime = newTime;
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
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  goHome(): void { this.router.navigate(['/home']); }
  bookNew(): void { this.router.navigate(['/add-appointment']); }

  async openVisitFromAppointment(appt: Appointment): Promise<void> {
    const directPatientId = (appt.patientId || '').trim();
    if (directPatientId) {
      // Keep patient ailments in sync with what was entered during appointment booking.
      if (appt.ailments && appt.ailments.trim()) {
        try {
          await this.patientService.updatePatient(directPatientId, { ailments: appt.ailments });
        } catch {
          // Don't block navigation if the update fails.
        }
      }
      this.router.navigate(['/patient', directPatientId, 'add-visit'], { state: { origin: 'home' } });
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