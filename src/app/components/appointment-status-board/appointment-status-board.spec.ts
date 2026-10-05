import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';
import { SimpleChange } from '@angular/core';

describe('AppointmentStatusBoardComponent - cardsFor performance & correctness', () => {
  let component: AppointmentStatusBoardComponent;

  const sampleAppointments: Appointment[] = [
    { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date('2026-04-20T10:00:00Z') },
    { id: '2', patientName: 'Bob', status: 'completed', datetime: new Date('2026-04-20T11:00:00Z') },
    { id: '3', patientName: 'Charlie', status: 'scheduled', datetime: new Date('2026-04-20T12:00:00Z') },
    { id: '4', patientName: 'David', status: 'cancelled', datetime: new Date('2026-04-20T13:00:00Z') },
  ];

  beforeEach(() => {
    component = new AppointmentStatusBoardComponent();
  });

  it('returns empty array when filteredAppointments is empty', () => {
    component.filteredAppointments = [];
    expect(component.cardsFor('scheduled')).toEqual([]);
    expect(component.cardsFor('completed')).toEqual([]);
    expect(component.cardsFor('cancelled')).toEqual([]);
  });

  it('correctly filters appointments by status using cached map lookup', () => {
    component.filteredAppointments = sampleAppointments;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, sampleAppointments, true)
    });

    const scheduled = component.cardsFor('scheduled');
    expect(scheduled.length).toBe(2);
    expect(scheduled.map(a => a.id)).toEqual(['1', '3']);

    const completed = component.cardsFor('completed');
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe('2');

    const cancelled = component.cardsFor('cancelled');
    expect(cancelled.length).toBe(1);
    expect(cancelled[0].id).toBe('4');
  });

  it('reuses identical cached array reference on subsequent calls without re-filtering', () => {
    component.filteredAppointments = sampleAppointments;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, sampleAppointments, true)
    });

    const call1 = component.cardsFor('scheduled');
    const call2 = component.cardsFor('scheduled');

    // Strict reference equality proves no new array was created/filtered
    expect(call1).toBe(call2);
  });

  it('updates cached cards when filteredAppointments array reference changes', () => {
    component.filteredAppointments = sampleAppointments;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, sampleAppointments, true)
    });

    expect(component.cardsFor('scheduled').length).toBe(2);

    const updatedAppointments: Appointment[] = [
      ...sampleAppointments,
      { id: '5', patientName: 'Eve', status: 'scheduled', datetime: new Date('2026-04-20T14:00:00Z') }
    ];

    component.filteredAppointments = updatedAppointments;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(sampleAppointments, updatedAppointments, false)
    });

    const scheduledUpdated = component.cardsFor('scheduled');
    expect(scheduledUpdated.length).toBe(3);
    expect(scheduledUpdated.map(a => a.id)).toEqual(['1', '3', '5']);
  });
});
