import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleChange } from '@angular/core';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';

describe('AppointmentStatusBoardComponent', () => {
  let component: AppointmentStatusBoardComponent;

  beforeEach(() => {
    component = new AppointmentStatusBoardComponent();
  });

  it('should group appointments by status when filteredAppointments changes', () => {
    const appts: Appointment[] = [
      { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date() },
      { id: '2', patientName: 'Bob', status: 'completed', datetime: new Date() },
      { id: '3', patientName: 'Charlie', status: 'scheduled', datetime: new Date() }
    ];

    component.filteredAppointments = appts;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, appts, true)
    });

    expect(component.cardsFor('scheduled').length).toBe(2);
    expect(component.cardsFor('completed').length).toBe(1);
    expect(component.cardsFor('cancelled').length).toBe(0);
  });
});
