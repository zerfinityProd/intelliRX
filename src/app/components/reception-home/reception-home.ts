// src/app/components/reception-home/reception-home.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { AppointmentService } from '../../services/appointmentService';
import { FirebaseService } from '../../services/firebase';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService } from '../../services/authorizationService';
import { Appointment } from '../../models/appointment.model';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { todayLocalISO } from '../../utilities/local-date';
import { normalizeEmail } from '../../utilities/normalize-email';
import doctorsData from '../../data/doctors.json';

@Component({
    selector: 'app-reception-home',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent],
    templateUrl: './reception-home.html',
    styleUrl: './reception-home.css'
})
export class ReceptionHomeComponent implements OnInit, OnDestroy {
    appointments: Appointment[] = [];
    isLoading = true;
    errorMessage = '';

    // Search
    searchTerm = '';

    // Drag state
    draggingCard: Appointment | null = null;
    dragOverColumn: Appointment['status'] | null = null;
    updatingId: string | null = null;

    // Date filter — today by default
    selectedDate: string = todayLocalISO();

    // Clinic & Doctor filters
    filterClinicId: string = '';
    filterDoctorId: string = '';
    clinicOptions: Array<{ id: string; label: string }> = [];
    readonly allDoctors: Array<{ id: string; name: string; specialty: string; email: string }> = doctorsData as any[];
    private doctorNameCache = new Map<string, string>();

    readonly appointmentsDateMin: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMin;
    readonly appointmentsDateMax: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMax;

    // Calendar
    calendarDate: Date = new Date();
    selectedCalDate: Date | null = null;

    // Greeting
    greeting: string = '';
    userName: string = '';

    readonly columns = [
        { id: 'scheduled' as const, label: 'Scheduled', color: '#ede9fe', accent: '#6366f1', icon: 'clock' },
        { id: 'completed' as const, label: 'Completed', color: '#d1fae5', accent: '#10b981', icon: 'check' },
        { id: 'cancelled' as const, label: 'Cancelled', color: '#fee2e2', accent: '#ef4444', icon: 'x' },
    ];

    private appointmentService = inject(AppointmentService);
    private authService = inject(AuthenticationService);
    private authorizationService = inject(AuthorizationService);
    private patientService = inject(PatientService);
    private firebaseService = inject(FirebaseService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);

    private autoCancelTimer: ReturnType<typeof setTimeout> | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

    ngOnInit(): void {
        this.setGreeting();
        this.loadAppointments();
        this.loadClinicOptions();
        this.buildDoctorNameCache();
        this.scheduleAutoCancelAtCutoff();
        // Keep UI in sync when appointment status changes from other pages.
        this.refreshTimer = setInterval(() => {
            void this.refreshAppointments();
        }, 3000);
    }

    ngOnDestroy(): void {
        if (this.autoCancelTimer) clearTimeout(this.autoCancelTimer);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
    }

    private async refreshAppointments(): Promise<void> {
        try {
            this.appointments = await this.appointmentService.getAllAppointments();
            this.cdr.detectChanges();
        } catch {
            // No-op
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
                        const candidates = results.filter((p: Patient) =>
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

    private setGreeting(): void {
        const hour = new Date().getHours();
        this.greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        this.userName = this.authService.currentUserValue?.name?.split(' ')[0] || 'there';
    }

    async loadAppointments(): Promise<void> {
        this.isLoading = true;
        try {
            this.appointments = await this.appointmentService.getAllAppointments();
        } catch {
            this.errorMessage = 'Failed to load appointments.';
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ── Filtered view ──

    get filteredAppointments(): Appointment[] {
        let result = this.appointments;

        if (this.selectedDate) {
            const [y, mo, d] = this.selectedDate.split('-').map(Number);
            result = result.filter(a => {
                const dt = new Date(a.appointmentDate);
                return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
            });
        }

        // Clinic filter
        if (this.filterClinicId) {
            result = result.filter(a => a.clinicId === this.filterClinicId);
        }

        // Doctor filter
        if (this.filterDoctorId) {
            result = result.filter(a => {
                const apptDoctorEmail = (a.doctorId || '').trim().toLowerCase();
                return apptDoctorEmail === this.filterDoctorId;
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

    get todayCount(): number {
        const t = new Date();
        return this.appointments.filter(a => {
            const d = new Date(a.appointmentDate);
            return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
        }).length;
    }

    get scheduledCount(): number {
        return this.appointments.filter(a => {
            if (a.status !== 'scheduled') return false;
            const d = new Date(a.appointmentDate);
            const t = new Date();
            return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
        }).length;
    }

    get completedTodayCount(): number {
        return this.appointments.filter(a => {
            if (a.status !== 'completed') return false;
            const d = new Date(a.appointmentDate);
            const t = new Date();
            return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
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

    // ── Calendar ──

    get calYear(): number { return this.calendarDate.getFullYear(); }
    get calMonth(): number { return this.calendarDate.getMonth(); }
    get calMonthLabel(): string {
        return this.calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    get calendarDays(): (Date | null)[] {
        const first = new Date(this.calYear, this.calMonth, 1);
        const last = new Date(this.calYear, this.calMonth + 1, 0);
        const days: (Date | null)[] = [];
        for (let i = 0; i < first.getDay(); i++) days.push(null);
        for (let d = 1; d <= last.getDate(); d++) days.push(new Date(this.calYear, this.calMonth, d));
        return days;
    }

    prevMonth(): void { this.calendarDate = new Date(this.calYear, this.calMonth - 1, 1); }
    nextMonth(): void { this.calendarDate = new Date(this.calYear, this.calMonth + 1, 1); }

    isToday(date: Date): boolean {
        const t = new Date();
        return date.getFullYear() === t.getFullYear() && date.getMonth() === t.getMonth() && date.getDate() === t.getDate();
    }

    isCalSelected(date: Date): boolean {
        if (!this.selectedCalDate) return false;
        return date.getFullYear() === this.selectedCalDate.getFullYear()
            && date.getMonth() === this.selectedCalDate.getMonth()
            && date.getDate() === this.selectedCalDate.getDate();
    }

    appointmentsOnDate(date: Date): Appointment[] {
        return this.appointments.filter(a => {
            const d = new Date(a.appointmentDate);
            return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
        });
    }

    onCalDayClick(date: Date): void {
        this.selectedCalDate = date;
        // Use local date parts to avoid UTC timezone shift (e.g. IST = UTC+5:30)
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        this.selectedDate = `${y}-${mo}-${d}`;
    }

    // ── Drag & Drop ──

    onDragStart(event: DragEvent, appt: Appointment): void {
        this.draggingCard = appt;
        event.dataTransfer?.setData('text/plain', appt.id ?? '');
        (event.target as HTMLElement).classList.add('rh-card--dragging');
    }

    onDragEnd(event: DragEvent): void {
        (event.target as HTMLElement).classList.remove('rh-card--dragging');
        this.draggingCard = null;
        this.dragOverColumn = null;
    }

    onDragOver(event: DragEvent, colId: Appointment['status']): void {
        event.preventDefault();
        this.dragOverColumn = colId;
    }

    onDragLeave(): void { this.dragOverColumn = null; }

    async onDrop(event: DragEvent, colId: Appointment['status']): Promise<void> {
        event.preventDefault();
        this.dragOverColumn = null;
        if (colId === 'completed') return;
        if (!this.draggingCard || this.draggingCard.status === colId) return;
        const appt = this.draggingCard;
        this.draggingCard = null;
        await this.updateStatus(appt, colId);
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
            this.errorMessage = 'Failed to update status.';
        } finally {
            this.updatingId = null;
            this.cdr.detectChanges();
        }
    }

    async openVisitFromAppointment(appt: Appointment): Promise<void> {
        const directPatientId = (appt.patientId || '').trim();
        if (directPatientId) {
            // Keep patient ailments in sync with what was entered during appointment booking.
            if (appt.ailments && appt.ailments.trim()) {
                try {
                    await this.patientService.updatePatient(directPatientId, { ailments: appt.ailments });
                } catch {
                    // Don't block navigation if this fails.
                }
            }
            this.router.navigate(['/patient', directPatientId, 'add-visit'], { state: { origin: 'home' } });
            return;
        }

        // Prefill Add Patient via query params
        this.router.navigate(['/home'], {
            queryParams: {
                openAddPatient: '1',
                name: appt.patientName || '',
                phone: appt.patientPhone || '',
                ailments: appt.ailments || ''
            }
        });
    }

    // ── Navigation ──

    bookNew(): void { this.router.navigate(['/add-appointment']); }

    bookOnDate(): void {
        this.router.navigate(['/add-appointment'], { queryParams: { date: this.selectedDate } });
    }

    formatTime(time: string): string {
        if (!time) return '';
        const [h, m] = time.split(':').map(Number);
        return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    formatDate(date: Date): string {
        return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // ── Clinic & Doctor helpers ──

    private async loadClinicOptions(): Promise<void> {
        const email = this.authService.currentUserValue?.email;
        if (!email) return;
        try {
            const clinicIds = await this.authorizationService.getUserClinicIds(email);
            this.clinicOptions = clinicIds.map(id => ({ id, label: `Clinic ${id}` }));
            this.cdr.detectChanges();
        } catch {
            this.clinicOptions = [];
        }
    }

    private buildDoctorNameCache(): void {
        for (const doc of this.allDoctors) {
            this.doctorNameCache.set(normalizeEmail(doc.email), doc.name);
        }
    }

    /** Resolve doctor display name from email stored in appointment.doctorId */
    getDoctorDisplayName(appt: Appointment): string {
        const email = (appt.doctorId || '').trim().toLowerCase();
        if (!email) return '';
        return this.doctorNameCache.get(email) || email;
    }

    /** Unique list of doctors that appear in current appointments for the filter dropdown */
    get doctorFilterOptions(): Array<{ email: string; name: string }> {
        const seen = new Set<string>();
        const options: Array<{ email: string; name: string }> = [];
        for (const appt of this.appointments) {
            const email = (appt.doctorId || '').trim().toLowerCase();
            if (!email || seen.has(email)) continue;
            seen.add(email);
            options.push({ email, name: this.doctorNameCache.get(email) || email });
        }
        return options.sort((a, b) => a.name.localeCompare(b.name));
    }

    onFilterClinicChange(): void {
        // Reset doctor filter if it doesn't exist in new clinic scope
        this.cdr.detectChanges();
    }

    onFilterDoctorChange(): void {
        this.cdr.detectChanges();
    }

    clearFilters(): void {
        this.filterClinicId = '';
        this.filterDoctorId = '';
        this.cdr.detectChanges();
    }

    get hasActiveFilters(): boolean {
        return !!(this.filterClinicId || this.filterDoctorId);
    }
}