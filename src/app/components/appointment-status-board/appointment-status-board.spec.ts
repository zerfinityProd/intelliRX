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

  it('should create component instance', () => {
    expect(component).toBeTruthy();
  });

  it('should return empty array when no appointments are provided', () => {
    component.filteredAppointments = [];
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, [], true)
    });
    expect(component.cardsFor('scheduled')).toEqual([]);
    expect(component.cardsFor('completed')).toEqual([]);
    expect(component.cardsFor('cancelled')).toEqual([]);
  });

  it('should pre-group appointments by status correctly', () => {
    const mockAppts: Appointment[] = [
      { id: '1', status: 'scheduled', patientName: 'John', datetime: new Date() },
      { id: '2', status: 'completed', patientName: 'Jane', datetime: new Date() },
      { id: '3', status: 'scheduled', patientName: 'Bob', datetime: new Date() },
      { id: '4', status: 'cancelled', patientName: 'Alice', datetime: new Date() }
    ];

    component.filteredAppointments = mockAppts;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, mockAppts, true)
    });

    const scheduled = component.cardsFor('scheduled');
    const completed = component.cardsFor('completed');
    const cancelled = component.cardsFor('cancelled');

    expect(scheduled.length).toBe(2);
    expect(scheduled.map(a => a.id)).toEqual(['1', '3']);

    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe('2');

    expect(cancelled.length).toBe(1);
    expect(cancelled[0].id).toBe('4');
  });

  it('should return stable cached array reference across multiple cardsFor calls', () => {
    const mockAppts: Appointment[] = [
      { id: '1', status: 'scheduled', patientName: 'John', datetime: new Date() }
    ];

    component.filteredAppointments = mockAppts;
    component.ngOnChanges({
      filteredAppointments: new SimpleChange(null, mockAppts, true)
    });

    const ref1 = component.cardsFor('scheduled');
    const ref2 = component.cardsFor('scheduled');

    expect(ref1).toBe(ref2);
  });

  it('should update cached groups when ngDoCheck detects array change', () => {
    const appt1: Appointment = { id: '1', status: 'scheduled', patientName: 'John', datetime: new Date() };
    component.filteredAppointments = [appt1];
    component.ngDoCheck();

    expect(component.cardsFor('scheduled').length).toBe(1);

    const appt2: Appointment = { id: '2', status: 'completed', patientName: 'Jane', datetime: new Date() };
    component.filteredAppointments = [appt1, appt2];
    component.ngDoCheck();

    expect(component.cardsFor('scheduled').length).toBe(1);
    expect(component.cardsFor('completed').length).toBe(1);
  });
});
