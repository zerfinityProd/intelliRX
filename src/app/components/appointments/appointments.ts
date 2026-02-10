import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth';
import { PatientService } from '../../services/patient';
import { AppointmentService } from '../../services/appointment';
import { Appointment, AppointmentSlot } from '../../models/appointment.model';
import { Patient } from '../../models/patient.model';

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './appointments.html',
  styleUrl: './appointments.css'
})
export class AppointmentsComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  appointments: Appointment[] = [];
  isLoading: boolean = true;
  errorMessage: string = '';
  successMessage: string = '';
  
  // Filter options
  selectedDate: string = '';
  selectedStatus: string = 'all';
  
  // New appointment form
  showAddForm: boolean = false;
  isSubmitting: boolean = false;
  isNewPatient: boolean = false;
  
  // Existing patient form fields
  searchTerm: string = '';
  searchResults: Patient[] = [];
  selectedPatient: Patient | null = null;
  appointmentDate: string = '';
  appointmentTime: string = '';
  duration: number = 30;
  reason: string = '';
  notes: string = '';
  
  // New patient form fields
  newPatientName: string = '';
  newPatientPhone: string = '';
  newPatientEmail: string = '';
  
  // Time slots
  availableTimeSlots: AppointmentSlot[] = [];
  selectedTimeSlot: string = '';
  
  private destroy$ = new Subject<void>();
  private searchTimeout: any;

  constructor(
    private authService: AuthService,
    private patientService: PatientService,
    private appointmentService: AppointmentService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.ngZone.run(() => {
          this.currentUser = user;
          this.cdr.detectChanges();
        });
      });
  }

  async ngOnInit(): Promise<void> {
    const today = new Date();
    this.selectedDate = today.toISOString().split('T')[0];
    this.appointmentDate = today.toISOString().split('T')[0];
    
    await this.loadAppointments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  async loadAppointments(): Promise<void> {
    this.ngZone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
    });

    try {
      let appointments: Appointment[];
      
      if (this.selectedDate) {
        appointments = await this.appointmentService.getAppointmentsByDate(new Date(this.selectedDate));
      } else {
        appointments = await this.appointmentService.getAllAppointments();
      }

      this.ngZone.run(() => {
        this.appointments = appointments;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error loading appointments:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'Failed to load appointments';
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  get filteredAppointments(): Appointment[] {
    if (this.selectedStatus === 'all') {
      return this.appointments;
    }
    return this.appointments.filter(apt => apt.status === this.selectedStatus);
  }

  async onDateFilterChange(): Promise<void> {
    await this.loadAppointments();
  }

  openAddForm(): void {
    this.isNewPatient = false;
    this.showAddForm = true;
    this.resetForm();
    
    // Generate time slots for today
    if (this.appointmentDate) {
      this.generateTimeSlots();
    }
  }

  closeAddForm(): void {
    this.showAddForm = false;
    this.resetForm();
  }

  togglePatientType(): void {
    this.isNewPatient = !this.isNewPatient;
    this.clearFormFields();
  }

  // Generate time slots for the selected date
  async generateTimeSlots(): Promise<void> {
    if (!this.appointmentDate) return;

    const slots: AppointmentSlot[] = [];
    const startHour = 9; // 9 AM
    const endHour = 17; // 5 PM
    const slotDuration = 30; // 30 minutes

    try {
      // Get existing appointments for the selected date
      const existingAppointments = await this.appointmentService.getAppointmentsByDate(
        new Date(this.appointmentDate)
      );

      // Filter only scheduled appointments (others don't block slots)
      const scheduledAppointments = existingAppointments.filter(apt => apt.status === 'scheduled');

      // Generate all possible time slots
      for (let hour = startHour; hour < endHour; hour++) {
        for (let minute = 0; minute < 60; minute += slotDuration) {
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          
          // Calculate slot time in minutes since midnight for comparison
          const slotMinutes = hour * 60 + minute;
          const slotEndMinutes = slotMinutes + this.duration;
          
          // Check if this slot conflicts with any scheduled appointment
          const isBooked = scheduledAppointments.some(apt => {
            const [aptHour, aptMinute] = apt.appointmentTime.split(':').map(s => parseInt(s));
            const aptStartMinutes = aptHour * 60 + aptMinute;
            const aptEndMinutes = aptStartMinutes + (apt.duration || 30);
            
            // Check for overlap: slot is booked if it overlaps with any part of an appointment
            // Overlap occurs if: (slot starts before apt ends) AND (slot ends after apt starts)
            return (slotMinutes < aptEndMinutes) && (slotEndMinutes > aptStartMinutes);
          });

          slots.push({
            time: timeStr,
            available: !isBooked
          });
        }
      }

      this.ngZone.run(() => {
        this.availableTimeSlots = slots;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error generating time slots:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'Failed to load available time slots';
        this.cdr.detectChanges();
      });
    }
  }

  async onAppointmentDateChange(): Promise<void> {
    // Clear selected time slot when date changes
    this.selectedTimeSlot = '';
    this.appointmentTime = '';
    
    // Generate new time slots for the selected date
    await this.generateTimeSlots();
  }

  async onDurationChange(): Promise<void> {
    // Regenerate time slots when duration changes (affects availability)
    await this.generateTimeSlots();
    
    // Clear selected slot if it's no longer valid
    if (this.selectedTimeSlot) {
      const slot = this.availableTimeSlots.find(s => s.time === this.selectedTimeSlot);
      if (slot && !slot.available) {
        this.selectedTimeSlot = '';
        this.appointmentTime = '';
      }
    }
  }

  selectTimeSlot(slot: AppointmentSlot): void {
    if (slot.available) {
      this.selectedTimeSlot = slot.time;
      this.appointmentTime = slot.time;
      this.cdr.detectChanges();
    }
  }

  formatTimeSlot(time: string): string {
    const [hours, minutes] = time.split(':').map(h => parseInt(h));
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  formatDateForDisplay(dateStr: string): string {
    if (!dateStr) return 'N/A';
    
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  get availableSlotsCount(): number {
    return this.availableTimeSlots.filter(slot => slot.available).length;
  }

  async onPatientSearch(): Promise<void> {
    // Clear any existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!this.searchTerm || this.searchTerm.length < 2) {
      this.searchResults = [];
      return;
    }

    // Debounce search by 500ms
    this.searchTimeout = setTimeout(async () => {
      try {
        await this.patientService.searchPatients(this.searchTerm);
        this.patientService.searchResults$
          .pipe(takeUntil(this.destroy$))
          .subscribe(results => {
            this.ngZone.run(() => {
              this.searchResults = results;
              this.cdr.detectChanges();
            });
          });
      } catch (error) {
        console.error('Error searching patients:', error);
      }
    }, 500);
  }

  selectPatient(patient: Patient): void {
    this.selectedPatient = patient;
    this.searchTerm = patient.name;
    this.searchResults = [];
    this.cdr.detectChanges();
  }

  clearPatientSelection(): void {
    this.selectedPatient = null;
    this.searchTerm = '';
    this.searchResults = [];
    this.cdr.detectChanges();
  }

  isFormValid(): boolean {
    // Common validation
    if (!this.appointmentDate || !this.selectedTimeSlot || !this.reason.trim()) {
      return false;
    }

    // Patient-specific validation
    if (this.isNewPatient) {
      return !!(this.newPatientName.trim() && 
                this.newPatientPhone.trim() &&
                this.patientService.isValidPhone(this.newPatientPhone.trim()));
    } else {
      return !!this.selectedPatient;
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;
    this.cdr.detectChanges();

    try {
      let patientId: string;
      let patientName: string;
      let patientPhone: string;

      if (this.isNewPatient) {
        // Create new patient first
        const email = this.newPatientEmail.trim() || undefined;
        
        patientId = await this.patientService.createPatient({
          name: this.newPatientName.trim(),
          phone: this.newPatientPhone.trim(),
          email
        });
        
        patientName = this.newPatientName.trim();
        patientPhone = this.newPatientPhone.trim();
      } else {
        // Use existing patient
        if (!this.selectedPatient) {
          throw new Error('No patient selected');
        }
        
        patientId = this.selectedPatient.uniqueId;
        patientName = this.selectedPatient.name;
        patientPhone = this.selectedPatient.phone;
      }

      // Create appointment
      const appointmentData = {
        patientId,
        patientName,
        patientPhone,
        appointmentDate: new Date(this.appointmentDate),
        appointmentTime: this.appointmentTime,
        duration: this.duration,
        reason: this.reason.trim(),
        status: 'scheduled' as const,
        notes: this.notes.trim() || undefined
      };

      await this.appointmentService.createAppointment(appointmentData);

      this.ngZone.run(() => {
        this.successMessage = `Appointment scheduled successfully for ${this.formatTime(this.appointmentTime)}!`;
        this.isSubmitting = false;
        this.cdr.detectChanges();
      });

      // Reload appointments
      await this.loadAppointments();

      // Close form after 1.5 seconds
      setTimeout(() => {
        this.closeAddForm();
        this.successMessage = '';
      }, 1500);
    } catch (error) {
      console.error('Error creating appointment:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'Failed to schedule appointment. Please try again.';
        this.isSubmitting = false;
        this.cdr.detectChanges();
      });
    }
  }

  validateForm(): boolean {
    if (this.isNewPatient) {
      if (!this.newPatientName.trim()) {
        this.errorMessage = 'Patient name is required';
        return false;
      }

      if (!this.newPatientPhone.trim()) {
        this.errorMessage = 'Phone number is required';
        return false;
      }

      if (!this.patientService.isValidPhone(this.newPatientPhone.trim())) {
        this.errorMessage = 'Please enter a valid 10-digit phone number';
        return false;
      }

      if (this.newPatientEmail && !this.patientService.isValidEmail(this.newPatientEmail.trim())) {
        this.errorMessage = 'Please enter a valid email address';
        return false;
      }
    } else {
      if (!this.selectedPatient) {
        this.errorMessage = 'Please select a patient';
        return false;
      }
    }

    if (!this.appointmentDate) {
      this.errorMessage = 'Please select a date';
      return false;
    }

    if (!this.selectedTimeSlot) {
      this.errorMessage = 'Please select a time slot';
      return false;
    }

    if (!this.reason.trim()) {
      this.errorMessage = 'Please provide a reason for the appointment';
      return false;
    }

    return true;
  }

  clearFormFields(): void {
    // Clear form fields but keep date and time slots
    this.searchTerm = '';
    this.searchResults = [];
    this.selectedPatient = null;
    this.newPatientName = '';
    this.newPatientPhone = '';
    this.newPatientEmail = '';
    this.reason = '';
    this.notes = '';
    this.errorMessage = '';
  }

  resetForm(): void {
    // Clear all fields
    this.clearFormFields();
    
    // Reset to today's date
    this.appointmentDate = new Date().toISOString().split('T')[0];
    this.selectedTimeSlot = '';
    this.appointmentTime = '';
    this.duration = 30;
    this.availableTimeSlots = [];
    this.successMessage = '';
  }

  async updateAppointmentStatus(appointmentId: string, status: Appointment['status']): Promise<void> {
    try {
      await this.appointmentService.updateAppointment(appointmentId, { status });
      await this.loadAppointments();
      
      // Also regenerate time slots if we're on the same date
      if (this.appointmentDate) {
        await this.generateTimeSlots();
      }
      
      this.ngZone.run(() => {
        this.successMessage = `Appointment marked as ${status}`;
        this.cdr.detectChanges();
      });

      setTimeout(() => {
        this.successMessage = '';
        this.cdr.detectChanges();
      }, 3000);
    } catch (error) {
      console.error('Error updating appointment:', error);
      this.ngZone.run(() => {
        this.errorMessage = 'Failed to update appointment';
        this.cdr.detectChanges();
      });
    }
  }

  async cancelAppointment(appointmentId: string): Promise<void> {
    if (!confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    await this.updateAppointmentStatus(appointmentId, 'cancelled');
  }

  goToPatientDetails(patientId: string): void {
    this.router.navigate(['/patient', patientId]);
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  formatTime(time: string): string {
    if (!time) return 'N/A';
    
    const [hours, minutes] = time.split(':').map(h => parseInt(h));
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'scheduled': return 'status-scheduled';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      case 'no-show': return 'status-no-show';
      default: return '';
    }
  }
}