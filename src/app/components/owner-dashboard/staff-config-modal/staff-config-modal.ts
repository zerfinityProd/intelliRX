import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClinicUserAvailability } from '../../../models/clinic-user.model';
import { AdminService } from '../../../services/adminService';

@Component({
  selector: 'app-staff-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-config-modal.html',
  styleUrl: './staff-config-modal.css'
})
export class StaffConfigModalComponent {
  @Input() show = false;
  @Input() staff: any = null; // Contains user info + clinic_user details
  @Output() closeEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  isSaving = false;
  status = 'active';

  allWeekdays = [
    { label: 'Monday', value: 'mon' },
    { label: 'Tuesday', value: 'tue' },
    { label: 'Wednesday', value: 'wed' },
    { label: 'Thursday', value: 'thu' },
    { label: 'Friday', value: 'fri' },
    { label: 'Saturday', value: 'sat' },
    { label: 'Sunday', value: 'sun' }
  ];

  availability: ClinicUserAvailability = {};

  constructor(private adminService: AdminService) {}

  ngOnChanges() {
    if (this.show && this.staff) {
      this.status = this.staff.status || 'active';
      this.availability = this.staff.availability ? JSON.parse(JSON.stringify(this.staff.availability)) : {};
    }
  }

  hasTiming(day: string, shift: string): boolean {
    return this.availability[day]?.includes(shift) || false;
  }

  toggleTiming(day: string, shift: string, event: any) {
    if (!this.availability[day]) {
      this.availability[day] = [];
    }

    if (event.target.checked) {
      if (!this.availability[day].includes(shift)) {
        this.availability[day].push(shift);
      }
    } else {
      this.availability[day] = this.availability[day].filter((s: string) => s !== shift);
    }

    // Clean up empty days
    if (this.availability[day].length === 0) {
      delete this.availability[day];
    }
  }

  close() {
    this.closeEvent.emit();
  }

  async save() {
    if (!this.staff?.clinicUserId) return;
    this.isSaving = true;

    try {
      await this.adminService.updateClinicUser(this.staff.clinicUserId, {
        status: this.status as any,
        availability: this.availability
      });
      this.savedEvent.emit();
    } catch (e) {
      console.error(e);
      alert('Failed to save staff configuration');
    } finally {
      this.isSaving = false;
    }
  }
}
