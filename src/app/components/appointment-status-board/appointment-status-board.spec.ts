import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimpleChange } from '@angular/core';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

describe('AppointmentStatusBoardComponent', () => {
  let component: AppointmentStatusBoardComponent;
  let sampleColumns: BoardColumn[];
  let sampleAppts: Appointment[];

  beforeEach(() => {
    component = new AppointmentStatusBoardComponent();
    sampleColumns = [
      { id: 'scheduled', label: 'Scheduled', color: '#fff', accent: '#000', icon: 'clock' },
      { id: 'completed', label: 'Completed', color: '#fff', accent: '#000', icon: 'check' },
      { id: 'cancelled', label: 'Cancelled', color: '#fff', accent: '#000', icon: 'x' },
    ];
    sampleAppts = [
      { id: '10', patientName: 'Dave', status: 'scheduled', datetime: new Date(), doctor_id: 'docA@example.com' },
      { id: '11', patientName: 'Eve', status: 'cancelled', datetime: new Date(), doctor_id: 'docB@example.com' },
      { id: '12', patientName: 'Frank', status: 'scheduled', datetime: new Date(), doctor_id: 'docA@example.com' },
    ];
    component.columns = sampleColumns;
    component.filteredAppointments = sampleAppts;
  });

  describe('Appointment Grouping (cardsFor)', () => {
    it('pre-groups appointments on ngOnChanges', () => {
      component.ngOnChanges({
        filteredAppointments: new SimpleChange(null, sampleAppts, true),
        columns: new SimpleChange(null, sampleColumns, true),
      });

      const scheduled = component.cardsFor('scheduled');
      const cancelled = component.cardsFor('cancelled');

      expect(scheduled.length).toBe(2);
      expect(scheduled.map(a => a.id)).toEqual(['10', '12']);
      expect(cancelled.length).toBe(1);
      expect(cancelled[0].id).toBe('11');
    });

    it('returns empty array for non-existent status', () => {
      component.ngOnChanges({
        filteredAppointments: new SimpleChange(null, sampleAppts, true),
      });
      expect(component.cardsFor('unknown_status' as any)).toEqual([]);
    });
  });

  describe('Doctor Name Memoization (getDoctorDisplayName)', () => {
    it('memoizes doctor display name per appointment instance', () => {
      const spyResolver = vi.fn((a: Appointment) => `Dr. ${a.doctor_id}`);
      component.doctorNameResolver = spyResolver;

      const appt = sampleAppts[0];
      const res1 = component.getDoctorDisplayName(appt);
      const res2 = component.getDoctorDisplayName(appt);

      expect(res1).toBe('Dr. docA@example.com');
      expect(res2).toBe('Dr. docA@example.com');
      expect(spyResolver).toHaveBeenCalledTimes(1);
    });
  });

  describe('Date Helpers (isToday)', () => {
    it('checks if a given date is today', () => {
      expect(component.isToday(new Date())).toBe(true);

      const oldDate = new Date(2020, 0, 1);
      expect(component.isToday(oldDate)).toBe(false);
    });
  });
});
