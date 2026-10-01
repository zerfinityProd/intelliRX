import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';

describe('AppointmentStatusBoardComponent', () => {
  let component: AppointmentStatusBoardComponent;

  beforeEach(() => {
    component = new AppointmentStatusBoardComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should pre-index appointments by status and return stable references from cardsFor', () => {
    const mockAppointments: Appointment[] = [
      { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date() },
      { id: '2', patientName: 'Bob', status: 'scheduled', datetime: new Date() },
      { id: '3', patientName: 'Charlie', status: 'completed', datetime: new Date() },
      { id: '4', patientName: 'David', status: 'cancelled', datetime: new Date() }
    ];

    component.filteredAppointments = mockAppointments;

    const scheduled1 = component.cardsFor('scheduled');
    const scheduled2 = component.cardsFor('scheduled');
    const completed = component.cardsFor('completed');
    const cancelled = component.cardsFor('cancelled');
    const noShow1 = component.cardsFor('no-show' as any);
    const noShow2 = component.cardsFor('no-show' as any);

    expect(scheduled1.length).toBe(2);
    expect(completed.length).toBe(1);
    expect(cancelled.length).toBe(1);
    expect(noShow1.length).toBe(0);

    // Verify reference equality (stable array reference returned for change detection efficiency)
    expect(scheduled1).toBe(scheduled2);
    expect(noShow1).toBe(noShow2);
  });
});
