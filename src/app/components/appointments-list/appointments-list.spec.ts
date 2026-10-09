import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentsListComponent } from './appointments-list';
import { AppointmentStatusBoardComponent } from '../appointment-status-board/appointment-status-board';
import { Appointment } from '../../models/appointment.model';

describe('AppointmentsListComponent Performance Optimization', () => {
  let component: AppointmentsListComponent;

  beforeEach(() => {
    component = Object.create(AppointmentsListComponent.prototype);
    component['appointments'] = [
      { id: '1', patientName: 'John Doe', status: 'scheduled', datetime: new Date('2026-04-10T10:00:00') } as Appointment,
      { id: '2', patientName: 'Jane Smith', status: 'completed', datetime: new Date('2026-04-10T11:00:00') } as Appointment,
      { id: '3', patientName: 'Bob Johnson', status: 'cancelled', datetime: new Date('2026-04-10T12:00:00') } as Appointment,
    ];
    component['searchTerm'] = '';
    component['selectedDate'] = '2026-04-10';
    component['cachedAppointmentsRef'] = null;
    component['cachedSearchTerm'] = null;
    component['cachedSelectedDate'] = null;
    component['cachedFilteredAppointments'] = [];
  });

  it('should compute filteredAppointments on first call and return cached reference on subsequent calls', () => {
    const firstCall = component.filteredAppointments;
    expect(firstCall.length).toBe(3);

    const secondCall = component.filteredAppointments;
    expect(secondCall).toBe(firstCall); // Exact same reference
  });

  it('should recompute filteredAppointments when selectedDate changes', () => {
    const firstCall = component.filteredAppointments;
    component.selectedDate = '2026-04-11';
    const secondCall = component.filteredAppointments;

    expect(secondCall).not.toBe(firstCall);
    expect(secondCall.length).toBe(0);
  });

  it('should recompute filteredAppointments when appointments array reference changes on status update', () => {
    const firstCall = component.filteredAppointments;
    expect(firstCall.length).toBe(3);

    // Mutate an appointment status and reassign appointments array reference
    component['appointments'][0].status = 'cancelled';
    component['appointments'] = [...component['appointments']];

    const secondCall = component.filteredAppointments;
    expect(secondCall).not.toBe(firstCall); // Cache invalidated due to array reference change
  });
});

describe('AppointmentStatusBoardComponent Cards Pre-Grouping', () => {
  let board: AppointmentStatusBoardComponent;

  beforeEach(() => {
    board = new AppointmentStatusBoardComponent();
  });

  it('should group cards by status when filteredAppointments input changes', () => {
    const mockAppts: Appointment[] = [
      { id: '1', status: 'scheduled' } as Appointment,
      { id: '2', status: 'completed' } as Appointment,
      { id: '3', status: 'scheduled' } as Appointment,
    ];

    board.filteredAppointments = mockAppts;

    const scheduled = board.cardsFor('scheduled');
    const completed = board.cardsFor('completed');
    const cancelled = board.cardsFor('cancelled');

    expect(scheduled.length).toBe(2);
    expect(completed.length).toBe(1);
    expect(cancelled.length).toBe(0);

    // Repeated call should return exact same reference in O(1)
    expect(board.cardsFor('scheduled')).toBe(scheduled);
  });
});
