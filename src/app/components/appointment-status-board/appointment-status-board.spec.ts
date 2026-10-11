import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { ReceptionAppointmentBoardComponent } from '../reception-appointment-board/reception-appointment-board';
import { Appointment } from '../../models/appointment.model';

describe('Kanban Boards Status Grouping Optimization', () => {
  describe('AppointmentStatusBoardComponent', () => {
    let comp: AppointmentStatusBoardComponent;

    beforeEach(() => {
      comp = new AppointmentStatusBoardComponent();
    });

    it('groups appointments by status into map and returns via cardsFor in O(1)', () => {
      const scheduled: Appointment = { id: '1', status: 'scheduled', patientName: 'P1' };
      const completed: Appointment = { id: '2', status: 'completed', patientName: 'P2' };
      const cancelled: Appointment = { id: '3', status: 'cancelled', patientName: 'P3' };

      comp.filteredAppointments = [scheduled, completed, cancelled];

      expect(comp.cardsFor('scheduled')).toEqual([scheduled]);
      expect(comp.cardsFor('completed')).toEqual([completed]);
      expect(comp.cardsFor('cancelled')).toEqual([cancelled]);
    });
  });

  describe('ReceptionAppointmentBoardComponent', () => {
    let comp: ReceptionAppointmentBoardComponent;

    beforeEach(() => {
      comp = new ReceptionAppointmentBoardComponent();
    });

    it('groups appointments by status into map and returns via cardsFor in O(1)', () => {
      const scheduled1: Appointment = { id: '1', status: 'scheduled', patientName: 'P1' };
      const scheduled2: Appointment = { id: '2', status: 'scheduled', patientName: 'P2' };
      const completed: Appointment = { id: '3', status: 'completed', patientName: 'P3' };

      comp.filteredAppointments = [scheduled1, scheduled2, completed];

      expect(comp.cardsFor('scheduled')).toEqual([scheduled1, scheduled2]);
      expect(comp.cardsFor('completed')).toEqual([completed]);
      expect(comp.cardsFor('cancelled')).toEqual([]);
    });
  });
});
