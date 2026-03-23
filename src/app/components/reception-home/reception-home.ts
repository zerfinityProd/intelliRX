// src/app/components/reception-home/reception-home.ts
import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar';
import { AppointmentService } from '../../services/appointmentService';
import { FirebaseService } from '../../services/firebase';
import { AuthenticationService } from '../../services/authenticationService';
import { Appointment } from '../../models/appointment.model';

@Component({
    selector: 'app-reception-home',
    standalone: true,
    imports: [CommonModule, FormsModule, NavbarComponent],
    templateUrl: './reception-home.html',
    styleUrl: './reception-home.css'
})
export class ReceptionHomeComponent implements OnInit {
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
    selectedDate: string = new Date().toISOString().split('T')[0];

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
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);

    ngOnInit(): void {
        this.setGreeting();
        this.loadAppointments();
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
        const term = this.searchTerm.trim().toLowerCase();
        if (term) {
            result = result.filter(a =>
                a.patientName.toLowerCase().includes(term) || (a.patientPhone ?? '').includes(term)
            );
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
        return this.selectedDate === new Date().toISOString().split('T')[0];
    }

    goToday(): void {
        this.selectedDate = new Date().toISOString().split('T')[0];
    }

    onDateInput(value: string): void {
        if (!value) return;
        const year = parseInt(value.split('-')[0], 10);
        if (year < 2000 || year > 2099) {
            this.selectedDate = new Date().toISOString().split('T')[0];
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
        if (!this.draggingCard || this.draggingCard.status === colId) return;
        const appt = this.draggingCard;
        this.draggingCard = null;
        await this.updateStatus(appt, colId);
    }

    async updateStatus(appt: Appointment, status: Appointment['status']): Promise<void> {
        if (appt.status === status || this.updatingId === appt.id) return;
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
}