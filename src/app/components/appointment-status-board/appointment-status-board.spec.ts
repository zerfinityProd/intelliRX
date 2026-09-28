import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

describe('AppointmentStatusBoardComponent (Performance & Logic)', () => {
  let component: AppointmentStatusBoardComponent;

  const mockColumns: BoardColumn[] = [
    { id: 'scheduled', label: 'Scheduled', color: '#fff', accent: '#000', icon: 'clock' },
    { id: 'completed', label: 'Completed', color: '#fff', accent: '#000', icon: 'check' },
    { id: 'cancelled', label: 'Cancelled', color: '#fff', accent: '#000', icon: 'x' },
  ];

  const mockAppointments: Appointment[] = [
    { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date() },
    { id: '2', patientName: 'Bob', status: 'scheduled', datetime: new Date('2020-01-01') },
    { id: '3', patientName: 'Charlie', status: 'completed', datetime: new Date() },
  ];

  beforeEach(() => {
    component = new AppointmentStatusBoardComponent();
    component.columns = mockColumns;
    component.filteredAppointments = mockAppointments;
    component.ngOnInit();
  });

  describe('cardsFor optimization', () => {
    it('returns appointments grouped by status correctly', () => {
      const scheduled = component.cardsFor('scheduled');
      expect(scheduled.length).toBe(2);

      const completed = component.cardsFor('completed');
      expect(completed.length).toBe(1);

      const cancelled = component.cardsFor('cancelled');
      expect(cancelled.length).toBe(0);
    });

    it('returns stable reference on repeated calls', () => {
      const firstCall = component.cardsFor('scheduled');
      const secondCall = component.cardsFor('scheduled');
      expect(firstCall).toBe(secondCall);
    });

    it('updates grouped cards when ngOnChanges fires', () => {
      const updated: Appointment[] = [
        { id: '4', patientName: 'David', status: 'cancelled', datetime: new Date() },
      ];
      component.filteredAppointments = updated;
      component.ngOnChanges({
        filteredAppointments: {
          currentValue: updated,
          previousValue: mockAppointments,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.cardsFor('scheduled').length).toBe(0);
      expect(component.cardsFor('cancelled').length).toBe(1);
    });
  });

  describe('isToday date evaluation', () => {
    it('correctly identifies today', () => {
      expect(component.isToday(new Date())).toBe(true);
    });

    it('correctly identifies past date as not today', () => {
      expect(component.isToday(new Date('2020-01-01'))).toBe(false);
    });
  });
});
