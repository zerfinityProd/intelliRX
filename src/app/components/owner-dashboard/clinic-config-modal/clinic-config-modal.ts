import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Clinic, ClinicSchedule } from '../../../models/clinic.model';
import { ClinicRepository } from '../../../repositories/interfaces/clinic.repository';

@Component({
  selector: 'app-clinic-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clinic-config-modal.html',
  styleUrl: './clinic-config-modal.css'
})
export class ClinicConfigModalComponent {
  @Input() show = false;
  @Input() clinic: Clinic | null = null;
  @Output() closeEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  isSaving = false;

  allWeekdays = [
    { label: 'Monday', value: 'mon' },
    { label: 'Tuesday', value: 'tue' },
    { label: 'Wednesday', value: 'wed' },
    { label: 'Thursday', value: 'thu' },
    { label: 'Friday', value: 'fri' },
    { label: 'Saturday', value: 'sat' },
    { label: 'Sunday', value: 'sun' }
  ];

  schedule: ClinicSchedule = {
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    timings: []
  };

  fhStart = '09:00';
  fhEnd = '13:00';
  shStart = '17:00';
  shEnd = '21:00';

  constructor(private clinicRepo: ClinicRepository) {}

  ngOnChanges() {
    if (this.show && this.clinic) {
      if (this.clinic.schedule) {
        this.schedule = JSON.parse(JSON.stringify(this.clinic.schedule));
        
        const fh = this.schedule.timings.find(t => t.label === 'FH');
        if (fh) {
          this.fhStart = fh.start;
          this.fhEnd = fh.end;
        }

        const sh = this.schedule.timings.find(t => t.label === 'SH');
        if (sh) {
          this.shStart = sh.start;
          this.shEnd = sh.end;
        }
      }
    }
  }

  toggleWeekday(day: string, event: any) {
    if (event.target.checked) {
      if (!this.schedule.weekdays.includes(day)) {
        this.schedule.weekdays.push(day);
      }
    } else {
      this.schedule.weekdays = this.schedule.weekdays.filter(d => d !== day);
    }
  }

  close() {
    this.closeEvent.emit();
  }

  async save() {
    if (!this.clinic?.id) return;
    this.isSaving = true;

    this.schedule.timings = [
      { label: 'FH', start: this.fhStart, end: this.fhEnd },
      { label: 'SH', start: this.shStart, end: this.shEnd }
    ];

    try {
      await this.clinicRepo.updateClinic(this.clinic.id, { schedule: this.schedule });
      this.savedEvent.emit();
    } catch (e) {
      console.error(e);
      alert('Failed to save clinic configuration');
    } finally {
      this.isSaving = false;
    }
  }
}
