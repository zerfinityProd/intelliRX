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