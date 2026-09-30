import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimpleChange } from '@angular/core';
import { ReceptionAppointmentBoardComponent } from './reception-appointment-board';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

describe('ReceptionAppointmentBoardComponent', () => {
  let component: ReceptionAppointmentBoardComponent;
  let sampleColumns: BoardColumn[];
  let sampleAppts: Appointment[];

  beforeEach(() => {
    component = new ReceptionAppointmentBoardComponent();
    sampleColumns = [
      { id: 'scheduled', label: 'Scheduled', color: '#fff', accent: '#000', icon: 'clock' },
      { id: 'completed', label: 'Completed', color: '#fff', accent: '#000', icon: 'check' },
      { id: 'cancelled', label: 'Cancelled', color: '#fff', accent: '#000', icon: 'x' },
    ];
    sampleAppts = [
      { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date(), doctor_id: 'doc1@example.com' },
      { id: '2', patientName: 'Bob', status: 'completed', datetime: new Date(), doctor_id: 'doc2@example.com' },
      { id: '3', patientName: 'Charlie', status: 'scheduled', datetime: new Date(), doctor_id: 'doc1@example.com' },
    ];
    component.columns = sampleColumns;
    component.filteredAppointments = sampleAppts;
  });

  describe('Appointment Grouping (cardsFor)', () => {
    it('groups appointments by status on ngOnChanges', () => {
      component.ngOnChanges({
        filteredAppointments: new SimpleChange(null, sampleAppts, true),
        columns: new SimpleChange(null, sampleColumns, true),
      });

      const scheduled = component.cardsFor('scheduled');
      const completed = component.cardsFor('completed');
      const cancelled = component.cardsFor('cancelled');

      expect(scheduled.length).toBe(2);
      expect(scheduled.map(a => a.id)).toEqual(['1', '3']);
      expect(completed.length).toBe(1);
      expect(completed[0].id).toBe('2');
      expect(cancelled.length).toBe(0);
    });

    it('falls back to lazy update if cardsFor is called before ngOnChanges', () => {
      const scheduled = component.cardsFor('scheduled');
      expect(scheduled.length).toBe(2);
    });
  });

  describe('Doctor Name Memoization (getDoctorDisplayName)', () => {
    it('uses doctorNameResolver and memoizes result', () => {
      const resolverSpy = vi.fn((appt: Appointment) => `Dr. ${appt.doctor_id}`);
      component.doctorNameResolver = resolverSpy;

      const appt = sampleAppts[0];
      const firstCall = component.getDoctorDisplayName(appt);
      const secondCall = component.getDoctorDisplayName(appt);

      expect(firstCall).toBe('Dr. doc1@example.com');
      expect(secondCall).toBe('Dr. doc1@example.com');
      expect(resolverSpy).toHaveBeenCalledTimes(1);
    });

    it('clears memoization cache when doctorNameResolver changes in ngOnChanges', () => {
      const resolver1 = vi.fn(() => 'Dr. Smith');
      component.doctorNameResolver = resolver1;

      const appt = sampleAppts[0];
      expect(component.getDoctorDisplayName(appt)).toBe('Dr. Smith');

      const resolver2 = vi.fn(() => 'Dr. Jones');
      component.doctorNameResolver = resolver2;
      component.ngOnChanges({
        doctorNameResolver: new SimpleChange(resolver1, resolver2, false),
      });

      expect(component.getDoctorDisplayName(appt)).toBe('Dr. Jones');
      expect(resolver2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Date Helpers (isToday)', () => {
    it('identifies today correctly', () => {
      const today = new Date();
      expect(component.isToday(today)).toBe(true);
    });

    it('identifies past and future dates as not today', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(component.isToday(yesterday)).toBe(false);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(component.isToday(tomorrow)).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(component.isToday(null)).toBe(false);
      expect(component.isToday(undefined)).toBe(false);
    });
  });
});
