import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ReceptionAppointmentBoardComponent } from './reception-appointment-board';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

describe('ReceptionAppointmentBoardComponent (Performance & Logic)', () => {
  let component: ReceptionAppointmentBoardComponent;

  const mockColumns: BoardColumn[] = [
    { id: 'scheduled', label: 'Scheduled', color: '#fff', accent: '#000', icon: 'clock' },
    { id: 'completed', label: 'Completed', color: '#fff', accent: '#000', icon: 'check' },
    { id: 'cancelled', label: 'Cancelled', color: '#fff', accent: '#000', icon: 'x' },
  ];

  const mockAppointments: Appointment[] = [
    { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date() },
    { id: '2', patientName: 'Bob', status: 'scheduled', datetime: new Date('2020-01-01') },
    { id: '3', patientName: 'Charlie', status: 'completed', datetime: new Date() },
    { id: '4', patientName: 'Diana', status: 'cancelled', datetime: new Date('2020-05-05') },
  ];

  beforeEach(() => {
    component = new ReceptionAppointmentBoardComponent();
    component.columns = mockColumns;
    component.filteredAppointments = mockAppointments;
    component.ngOnInit();
  });

  describe('cardsFor optimization', () => {
    it('returns appointments grouped by status correctly', () => {
      const scheduled = component.cardsFor('scheduled');
      expect(scheduled.length).toBe(2);
      expect(scheduled.map(a => a.patientName)).toEqual(['Alice', 'Bob']);

      const completed = component.cardsFor('completed');
      expect(completed.length).toBe(1);
      expect(completed[0].patientName).toBe('Charlie');

      const cancelled = component.cardsFor('cancelled');
      expect(cancelled.length).toBe(1);
      expect(cancelled[0].patientName).toBe('Diana');
    });

    it('returns stable reference on repeated calls', () => {
      const firstCall = component.cardsFor('scheduled');
      const secondCall = component.cardsFor('scheduled');
      expect(firstCall).toBe(secondCall);
    });

    it('updates grouped cards when ngOnChanges fires with new filteredAppointments', () => {
      const newAppointments: Appointment[] = [
        { id: '5', patientName: 'Eve', status: 'completed', datetime: new Date() },
      ];
      component.filteredAppointments = newAppointments;
      component.ngOnChanges({
        filteredAppointments: {
          currentValue: newAppointments,
          previousValue: mockAppointments,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.cardsFor('scheduled').length).toBe(0);
      expect(component.cardsFor('completed').length).toBe(1);
      expect(component.cardsFor('completed')[0].patientName).toBe('Eve');
    });

    it('returns empty array for status with no appointments', () => {
      component.filteredAppointments = [];
      component.ngOnChanges({
        filteredAppointments: {
          currentValue: [],
          previousValue: mockAppointments,
          firstChange: false,
          isFirstChange: () => false,
        },
      });
      expect(component.cardsFor('scheduled')).toEqual([]);
    });
  });

  describe('isToday date evaluation', () => {
    it('correctly identifies today', () => {
      expect(component.isToday(new Date())).toBe(true);
    });

    it('correctly identifies past or future dates as not today', () => {
      expect(component.isToday(new Date('2020-01-01'))).toBe(false);
      expect(component.isToday(new Date('2099-12-31'))).toBe(false);
    });

    it('handles null or invalid inputs gracefully', () => {
      expect(component.isToday(null)).toBe(false);
      expect(component.isToday(undefined)).toBe(false);
    });
  });
});
