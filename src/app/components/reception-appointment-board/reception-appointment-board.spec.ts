import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ReceptionAppointmentBoardComponent } from './reception-appointment-board';
import { Appointment } from '../../models/appointment.model';

describe('ReceptionAppointmentBoardComponent', () => {
  let component: ReceptionAppointmentBoardComponent;

  beforeEach(() => {
    component = new ReceptionAppointmentBoardComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should pre-index appointments by status and return stable references from cardsFor', () => {
    const mockAppointments: Appointment[] = [
      { id: '10', patientName: 'Eve', status: 'scheduled', datetime: new Date() },
      { id: '11', patientName: 'Frank', status: 'completed', datetime: new Date() },
      { id: '12', patientName: 'Grace', status: 'completed', datetime: new Date() }
    ];

    component.filteredAppointments = mockAppointments;

    const scheduled = component.cardsFor('scheduled');
    const completed1 = component.cardsFor('completed');
    const completed2 = component.cardsFor('completed');

    expect(scheduled.length).toBe(1);
    expect(completed1.length).toBe(2);

    // Verify reference equality (stable array reference returned for change detection efficiency)
    expect(completed1).toBe(completed2);
  });
});
