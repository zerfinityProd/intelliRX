// src/app/components/reception-home/reception-home.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { DayViewModalComponent } from '../day-view-modal/day-view-modal';
import { RhHeroComponent } from '../rh-hero/rh-hero';
import { RhKanbanBoardComponent } from '../rh-kanban-board/rh-kanban-board';
import { RhSidebarComponent } from '../rh-sidebar/rh-sidebar';
import { AppointmentService } from '../../services/appointmentService';
import { AuthenticationService } from '../../services/authenticationService';
import { AuthorizationService, UserPermissions } from '../../services/authorizationService';
import { Appointment } from '../../models/appointment.model';
import { PatientService } from '../../services/patient';
import { Patient } from '../../models/patient.model';
import { DEFAULT_SYSTEM_SETTINGS } from '../../config/systemSettings';
import { todayLocalISO } from '../../utilities/local-date';
import { normalizeEmail } from '../../utilities/normalize-email';
import { generateTimeSlotsFromConfig } from '../../utilities/timeSlotUtils';
import { ClinicService } from '../../services/clinicService';
import { ClinicContextService } from '../../services/clinicContextService';
import { TimeSlotService } from '../../services/timeSlotService';
import { DoctorCacheService, CachedDoctor } from '../../services/doctorCacheService';
import { AutoCancelService } from '../../services/autoCancelService';
import { formatTime as sharedFormatTime, formatSlotLabel as sharedFormatSlotLabel, formatDate as sharedFormatDate, normalizePhoneDigits, isSameLocalDay } from '../../utilities/date-helpers';


@Component({
    selector: 'app-reception-home',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent, DayViewModalComponent, RhHeroComponent, RhKanbanBoardComponent, RhSidebarComponent],
    templateUrl: './reception-home.html',
    styleUrl: './reception-home.css',
    encapsulation: ViewEncapsulation.None
})
export class ReceptionHomeComponent implements OnInit, OnDestroy {
    appointments: Appointment[] = [];
    isLoading = true;
    errorMessage = '';

    // Bound function reference for child component
    getDoctorDisplayNameFn = (appt: Appointment): string => this.getDoctorDisplayName(appt);

    // Search
    searchTerm = '';


    updatingId: string | null = null;

    // Drag-and-drop state
    draggingAppt: Appointment | null = null;
    dragOverColumn: string | null = null;

    // Cancel modal state
    showCancelModal = false;
    cancellingAppt: Appointment | null = null;
    cancelReason = '';
    isCancelling = false;
    cancelError = '';

    // Date filter — restored from sessionStorage or today by default
    selectedDate: string = sessionStorage.getItem('rh_selectedDate') || todayLocalISO();

    // ── Reschedule Modal State ──
    showRescheduleModal = false;
    reschedulingAppt: Appointment | null = null;
    rescheduleDate: string = '';
    rescheduleTime: string = '';
    rescheduleBookedSlots: string[] = [];
    isRescheduling = false;
    isLoadingRescheduleSlots = false;
    rescheduleError = '';
    allTimeSlots: string[] = generateTimeSlotsFromConfig(DEFAULT_SYSTEM_SETTINGS.timeSlots);
    readonly rescheduleMinDate: string = todayLocalISO();
    readonly rescheduleMaxDate: string = DEFAULT_SYSTEM_SETTINGS.addAppointment.maxDate;

    // Clinic & Doctor filters
    filterClinicId: string = '';
    filterDoctorId: string = '';
    clinicOptions: Array<{ id: string; label: string }> = [];
    allDoctors: CachedDoctor[] = [];
    private doctorNameCache = new Map<string, string>();

    readonly appointmentsDateMin: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMin;
    readonly appointmentsDateMax: string = DEFAULT_SYSTEM_SETTINGS.ui.appointmentsDateMax;

    // Calendar
    calendarDate: Date = new Date();
    selectedCalDate: Date | null = null;

    // Day View Modal
    showDayViewModal = false;
    dayViewDate: Date | null = null;
    dayViewAppointments: Appointment[] = [];
    dayViewBookedSlots: string[] = [];
    isLoadingDayView = false;

    // Greeting
    greeting: string = '';
    userName: string = '';

    // Permissions
    permissions: UserPermissions = {
        canDelete: false, canEdit: false, canAddPatient: false,
        canAddVisit: false, canAppointment: false, canCancel: false,
        canEditVisit: false,
    };

    readonly columns = [
        { id: 'scheduled' as const, label: 'Scheduled', color: '#E7F5F7', accent: '#148D9E', icon: 'clock' },
        { id: 'completed' as const, label: 'Completed', color: '#E7F5F7', accent: '#1CB5C9', icon: 'check' },
        { id: 'cancelled' as const, label: 'Cancelled', color: '#fee2e2', accent: '#ef4444', icon: 'x' },
    ];

    private appointmentService = inject(AppointmentService);
    private authService = inject(AuthenticationService);
    private authorizationService = inject(AuthorizationService);
    private patientService = inject(PatientService);
    private clinicService = inject(ClinicService);
    private clinicContextService = inject(ClinicContextService);
    private timeSlotService = inject(TimeSlotService);
    private doctorCacheService = inject(DoctorCacheService);
    private autoCancelService = inject(AutoCancelService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);

    private autoCancelTimer: ReturnType<typeof setTimeout> | null = null;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private autoCancelCleanup: (() => void) | null = null;

    ngOnInit(): void {
        this.setGreeting();
        this.loadPermissions();
        this.loadAppointments().then(() => {
            // Restore day view modal from sessionStorage after appointments load
            this.restoreDayViewFromSession();
        });
        this.loadClinicOptions();
        this.initDoctorCache();
        this.autoCancelCleanup = this.autoCancelService.scheduleAtCutoff(
            () => this.appointments,
            () => this.cdr.detectChanges()
        );
        // Sync calendar view to persisted date
        if (this.selectedDate) {
            const [y, mo] = this.selectedDate.split('-').map(Number);
            this.calendarDate = new Date(y, mo - 1, 1);
            const parts = this.selectedDate.split('-').map(Number);
            this.selectedCalDate = new Date(parts[0], parts[1] - 1, parts[2]);
        }
        // Keep UI in sync when appointment status changes from other pages.
        this.refreshTimer = setInterval(() => {
            void this.refreshAppointments();
        }, 3000);
    }

    ngOnDestroy(): void {
        if (this.autoCancelCleanup) this.autoCancelCleanup();
        if (this.refreshTimer) clearInterval(this.refreshTimer);
    }

    private async refreshAppointments(): Promise<void> {
        // Guard: skip if subscription context isn't ready yet
        if (!this.clinicContextService.getSubscriptionId()) return;
        try {
            this.appointments = await this.appointmentService.getAppointments();
            this.cdr.detectChanges();
        } catch {
            // No-op
        }
    }

    private scheduleAutoCancelAtCutoff(): void {
        // Now handled by AutoCancelService via scheduleAtCutoff()
    }

    // isSameLocalDay is now imported from date-helpers

    // normalizePhoneDigits is now imported from date-helpers

    // hasAnyVisitTodayForAppointment and runAutoCancel are now handled by AutoCancelService

    private setGreeting(): void {
        const hour = new Date().getHours();
        this.greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        this.userName = this.authService.currentUserValue?.name?.split(' ')[0] || 'there';
    }

    private async loadPermissions(): Promise<void> {
        const email = this.authService.currentUserValue?.email;
        if (!email) return;
        try {
            this.permissions = await this.authorizationService.getUserPermissions(email);
            this.cdr.detectChanges();
        } catch {
            // Keep defaults (all false)
        }
    }

    async loadAppointments(): Promise<void> {
        this.isLoading = true;
        try {
            this.appointments = await this.appointmentService.getAppointments();
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
                const dt = new Date(a.datetime);
                return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
            });
        }

        // Clinic filter
        if (this.filterClinicId) {
            result = result.filter(a => a.clinic_id === this.filterClinicId);
        }

        // Doctor filter
        if (this.filterDoctorId) {
            result = result.filter(a => {
                const apptDoctorEmail = (a.doctor_id || '').trim().toLowerCase();
                return apptDoctorEmail === this.filterDoctorId;
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

    get todayCount(): number {
        const t = new Date();
        return this.appointments.filter(a => {
            const d = new Date(a.datetime);
            return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
        }).length;
    }

    get scheduledCount(): number {
        return this.appointments.filter(a => {
            if (a.status !== 'scheduled') return false;
            const d = new Date(a.datetime);
            const t = new Date();
            return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
        }).length;
    }

    get completedTodayCount(): number {
        return this.appointments.filter(a => {
            if (a.status !== 'completed') return false;
            const d = new Date(a.datetime);
            const t = new Date();
            return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
        }).length;
    }

    get isSelectedToday(): boolean {
        return this.selectedDate === todayLocalISO();
    }

    goToday(): void {
        this.selectedDate = todayLocalISO();
        sessionStorage.setItem('rh_selectedDate', this.selectedDate);
    }

    onDateInput(value: string): void {
        if (!value) return;
        const year = parseInt(value.split('-')[0], 10);
        if (year < 2000 || year > 2099) {
            this.selectedDate = todayLocalISO();
        } else {
            this.selectedDate = value;
        }
        sessionStorage.setItem('rh_selectedDate', this.selectedDate);
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

    prevMonth(): void {
        this.calendarDate = new Date(this.calYear, this.calMonth - 1, 1);
        this.cdr.detectChanges();
    }
    nextMonth(): void {
        this.calendarDate = new Date(this.calYear, this.calMonth + 1, 1);
        this.cdr.detectChanges();
    }

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
            const d = new Date(a.datetime);
            return isSameLocalDay(d, date);
        });
    }

    onCalDayClick(date: Date): void {
        this.selectedCalDate = date;
        // Use local date parts to avoid UTC timezone shift (e.g. IST = UTC+5:30)
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        this.selectedDate = `${y}-${mo}-${d}`;
        sessionStorage.setItem('rh_selectedDate', this.selectedDate);
        // Open Day View Modal
        this.openDayViewModal(date);
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
        try {
            await this.appointmentService.cancelAppointment(this.cancellingAppt.id, reason);
            this.cancellingAppt.status = 'cancelled';
            this.cancellingAppt.cancellationReason = reason;
            this.closeCancelModal();
        } catch {
            this.cancelError = 'Failed to cancel appointment. Please try again.';
            this.isCancelling = false;
            this.cdr.detectChanges();
        }
    }

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
            this.errorMessage = 'Failed to update status.';
        } finally {
            this.updatingId = null;
            this.cdr.detectChanges();
        }
    }

    // ── Drag-and-Drop ──

    onDragStart(event: DragEvent, appt: Appointment): void {
        if (appt.status !== 'scheduled') {
            event.preventDefault();
            return;
        }
        this.draggingAppt = appt;
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

        if (appt.status === 'scheduled') {
            this.openCancelModal(appt);
        }
        this.cdr.detectChanges();
    }

    async openVisitFromAppointment(appt: Appointment): Promise<void> {
        const directPatientId = (appt.patient_id || '').trim();
        if (directPatientId) {
            // Keep patient ailments in sync with what was entered during appointment booking.
            if (appt.ailments && appt.ailments.trim()) {
                try {
                    await this.patientService.updatePatient(directPatientId, { ailments: appt.ailments });
                } catch {
                    // Don't block navigation if this fails.
                }
            }
            this.router.navigate(['/patient', directPatientId, 'add-visit'], {
                state: { origin: 'home', appointmentId: appt.id || '' }
            });
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

    bookNew(): void {
        const params: any = {};
        if (this.filterDoctorId) {
            const doc = this.allDoctors.find(d => normalizeEmail(d.email) === this.filterDoctorId);
            if (doc) params.doctorId = doc.id;
        }
        this.router.navigate(['/add-appointment'], { queryParams: params });
    }

    bookOnDate(): void {
        const params: any = { date: this.selectedDate };
        if (this.filterDoctorId) {
            const doc = this.allDoctors.find(d => normalizeEmail(d.email) === this.filterDoctorId);
            if (doc) params.doctorId = doc.id;
        }
        this.router.navigate(['/add-appointment'], { queryParams: params });
    }

    formatTime(time: Date | string): string {
        return sharedFormatTime(time);
    }

    formatDate(date: Date): string {
        return sharedFormatDate(date);
    }

    // ── Clinic & Doctor helpers ──

    private async loadClinicOptions(): Promise<void> {
        const email = this.authService.currentUserValue?.email;
        if (!email) return;
        try {
            const clinicIds = await this.authorizationService.getUserClinicIds(email);
            this.clinicOptions = clinicIds.map(id => ({ id, label: `Clinic ${id}` }));
            // Load clinic-specific timings for the first clinic
            if (clinicIds.length > 0) {
                await this.refreshTimeSlotsForClinic(clinicIds[0]);
            }
            this.cdr.detectChanges();
        } catch {
            this.clinicOptions = [];
        }
    }

    /** Build doctor name cache using DoctorCacheService */
    private async initDoctorCache(): Promise<void> {
        await this.doctorCacheService.buildCache();
        // Sync local references from centralized cache
        this.allDoctors = this.doctorCacheService.getAllDoctors();
        for (const doc of this.allDoctors) {
            this.doctorNameCache.set(normalizeEmail(doc.email), doc.name);
        }
        this.cdr.detectChanges();
    }

    /** Resolve doctor display name from email stored in appointment.doctorId */
    getDoctorDisplayName(appt: Appointment): string {
        const email = (appt.doctor_id || '').trim().toLowerCase();
        if (!email) return '';
        return this.doctorNameCache.get(email) || email;
    }

    /** Unique list of doctors that appear in current appointments for the filter dropdown */
    get doctorFilterOptions(): Array<{ email: string; name: string }> {
        return this.doctorCacheService.getDoctorFilterOptions(this.appointments);
    }

    async onFilterClinicChange(): Promise<void> {
        // Refresh time slots for the selected clinic
        await this.refreshTimeSlotsForClinic(this.filterClinicId || null);
        // Reset doctor filter if it doesn't exist in new clinic scope
        this.cdr.detectChanges();
    }

    /**
     * Fetch a clinic's schedule and regenerate time slots,
     * filtered by the selected doctor's weekday availability.
     * Falls back to global defaults when no clinic timings exist.
     */
    private async refreshTimeSlotsForClinic(clinicId?: string | null, date?: Date): Promise<void> {
        this.allTimeSlots = await this.timeSlotService.getTimeSlotsForClinic(
            clinicId,
            date || (this.selectedCalDate ?? undefined),
            this.filterDoctorId || ''
        );
    }

    async onFilterDoctorChange(): Promise<void> {
        // Refresh time slots to apply the new doctor's availability
        const clinicId = this.filterClinicId || (this.clinicOptions.length > 0 ? this.clinicOptions[0].id : null);
        await this.refreshTimeSlotsForClinic(clinicId);
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

    // ═══════════════════════════════════════════
    //  RESCHEDULE Modal
    // ═══════════════════════════════════════════

    async openRescheduleModal(appt: Appointment): Promise<void> {
        this.reschedulingAppt = appt;
        this.rescheduleTime = '';
        this.rescheduleBookedSlots = [];
        this.rescheduleError = '';
        this.isRescheduling = false;
        this.isLoadingRescheduleSlots = false;
        this.showRescheduleModal = true;

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const y = tomorrow.getFullYear();
        const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const d = String(tomorrow.getDate()).padStart(2, '0');
        this.rescheduleDate = `${y}-${m}-${d}`;
        await this.computeRescheduleBookedSlots();
        this.cdr.detectChanges();
    }

    cancelReschedule(): void {
        this.showRescheduleModal = false;
        this.reschedulingAppt = null;
        this.rescheduleDate = '';
        this.rescheduleTime = '';
        this.rescheduleBookedSlots = [];
        this.rescheduleError = '';
        this.cdr.detectChanges();
    }

    isRescheduleSlotInPast(slot: string): boolean {
        if (!this.rescheduleDate) return false;
        const today = new Date();
        const [y, mo, day] = this.rescheduleDate.split('-').map(Number);
        const isToday = today.getFullYear() === y && today.getMonth() === mo - 1 && today.getDate() === day;
        if (!isToday) return false;
        const [h, m] = slot.split(':').map(Number);
        const slotMinutes = h * 60 + m;
        const nowMinutes = today.getHours() * 60 + today.getMinutes();
        return slotMinutes <= nowMinutes;
    }

    get rescheduleAvailableSlots(): string[] {
        return this.allTimeSlots.filter(s => !this.rescheduleBookedSlots.includes(s) && !this.isRescheduleSlotInPast(s));
    }

    isRescheduleDateInPast(): boolean {
        if (!this.rescheduleDate) return false;
        return this.rescheduleDate < todayLocalISO();
    }

    async onRescheduleDateChange(): Promise<void> {
        this.rescheduleTime = '';
        this.rescheduleError = '';
        if (!this.rescheduleDate) {
            this.rescheduleBookedSlots = [];
            return;
        }
        if (this.isRescheduleDateInPast()) {
            this.rescheduleBookedSlots = [];
            this.rescheduleError = 'Cannot reschedule to a past date. Please select today or a future date.';
            this.cdr.detectChanges();
            return;
        }
        await this.computeRescheduleBookedSlots();
        this.cdr.detectChanges();
    }

    private async computeRescheduleBookedSlots(): Promise<void> {
        const appt = this.reschedulingAppt;
        if (!appt || !this.rescheduleDate) {
            this.rescheduleBookedSlots = [];
            return;
        }
        const doctorEmail = appt.doctor_id ? normalizeEmail(appt.doctor_id) : undefined;
        const clinicId = appt.clinic_id || undefined;
        const excludeId = appt.id || undefined;

        // ── Instant: compute from in-memory appointments (no network) ──
        const [y, mo, day] = this.rescheduleDate.split('-').map(Number);
        this.rescheduleBookedSlots = this.appointments
            .filter(a => {
                if (a.status === 'cancelled') return false;
                if (excludeId && a.id === excludeId) return false;
                const d = new Date(a.datetime);
                const sameDay = d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
                if (!sameDay) return false;
                if (doctorEmail && normalizeEmail(a.doctor_id || '') !== doctorEmail) return false;
                if (clinicId && a.clinic_id && a.clinic_id !== clinicId) return false;
                return true;
            })
            .map(a => {
                const dt = new Date(a.datetime);
                return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            });
        this.isLoadingRescheduleSlots = false;
        this.cdr.detectChanges();

        // ── Background: refresh from Firestore for accuracy ──
        try {
            const freshSlots = await this.appointmentService.getBookedSlotsForDate(
                this.rescheduleDate,
                doctorEmail,
                clinicId,
                excludeId
            );
            this.rescheduleBookedSlots = freshSlots;
        } catch {
            // Keep the in-memory result on error
        } finally {
            this.cdr.detectChanges();
        }
    }

    async submitReschedule(): Promise<void> {
        if (!this.reschedulingAppt?.id || !this.rescheduleDate || !this.rescheduleTime) {
            this.rescheduleError = 'Please select a date and time slot.';
            return;
        }
        if (this.isRescheduleDateInPast()) {
            this.rescheduleError = 'Cannot reschedule to a past date. Please select today or a future date.';
            return;
        }
        if (this.isRescheduleSlotInPast(this.rescheduleTime)) {
            this.rescheduleError = 'This time slot has already passed. Please select a future time.';
            this.rescheduleTime = '';
            return;
        }
        const newDate = new Date(this.rescheduleDate + 'T00:00:00');
        const newTime = this.rescheduleTime;
        const apptId = this.reschedulingAppt.id;

        this.reschedulingAppt.datetime = newDate;
        this.cancelReschedule();
        this.cdr.detectChanges();

        this.appointmentService.postponeAppointment(apptId, newDate, newTime)
            .then(() => this.refreshAppointments())
            .catch(() => {
                console.error('Reschedule write failed – will re-sync on next refresh.');
            });
    }

    formatSlotLabel(time: string): string {
        return sharedFormatSlotLabel(time);
    }

    // ═══════════════════════════════════════════
    //  Day View Modal
    // ═══════════════════════════════════════════

    async openDayViewModal(date: Date): Promise<void> {
        this.dayViewDate = date;
        this.showDayViewModal = true;
        this.isLoadingDayView = true;
        // Persist to sessionStorage
        const yy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        sessionStorage.setItem('rh_dayViewDate', `${yy}-${mm}-${dd}`);
        this.cdr.detectChanges();

        // Refresh slots for the selected date (applies doctor availability)
        const clinicId = this.filterClinicId || (this.clinicOptions.length > 0 ? this.clinicOptions[0].id : null);
        await this.refreshTimeSlotsForClinic(clinicId, date);

        // Build data for the modal
        this.dayViewAppointments = this.appointmentsOnDate(date);
        this.dayViewBookedSlots = this.dayViewAppointments
            .filter(a => a.status !== 'cancelled')
            .map(a => {
                const dt = new Date(a.datetime);
                return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            });
        this.isLoadingDayView = false;
        this.cdr.detectChanges();
    }

    closeDayView(): void {
        this.showDayViewModal = false;
        this.dayViewDate = null;
        this.dayViewAppointments = [];
        this.dayViewBookedSlots = [];
        sessionStorage.removeItem('rh_dayViewDate');
        this.cdr.detectChanges();
    }

    /** Restore day view modal state from sessionStorage (called after appointments load) */
    private restoreDayViewFromSession(): void {
        const saved = sessionStorage.getItem('rh_dayViewDate');
        if (!saved) return;
        const [y, mo, d] = saved.split('-').map(Number);
        if (!y || !mo || !d) return;
        const date = new Date(y, mo - 1, d);
        this.selectedCalDate = date;
        this.selectedDate = saved;
        sessionStorage.setItem('rh_selectedDate', saved);
        this.openDayViewModal(date);
    }

    onDayViewBookSlot(time: string): void {
        if (!this.dayViewDate) return;
        const y = this.dayViewDate.getFullYear();
        const mo = String(this.dayViewDate.getMonth() + 1).padStart(2, '0');
        const d = String(this.dayViewDate.getDate()).padStart(2, '0');
        const iso = `${y}-${mo}-${d}`;
        this.closeDayView();
        const params: any = { date: iso, time };
        if (this.filterDoctorId) {
            const doc = this.allDoctors.find(dc => normalizeEmail(dc.email) === this.filterDoctorId);
            if (doc) params.doctorId = doc.id;
        }
        this.router.navigate(['/add-appointment'], { queryParams: params });
    }

    onDayViewAddVisit(appt: Appointment): void {
        this.closeDayView();
        this.openVisitFromAppointment(appt);
    }

    onDayViewReschedule(appt: Appointment): void {
        this.closeDayView();
        this.openRescheduleModal(appt);
    }

    onDayViewCancel(appt: Appointment): void {
        this.closeDayView();
        this.openCancelModal(appt);
    }

    /** Whether the day view date is in the past */
    get isDayViewDateInPast(): boolean {
        if (!this.dayViewDate) return false;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const selected = new Date(this.dayViewDate.getFullYear(), this.dayViewDate.getMonth(), this.dayViewDate.getDate());
        return selected < todayStart;
    }

    /** Get the doctor name for the day view filtered display */
    get dayViewDoctorName(): string {
        if (!this.filterDoctorId) return '';
        return this.doctorNameCache.get(this.filterDoctorId) || '';
    }
}
