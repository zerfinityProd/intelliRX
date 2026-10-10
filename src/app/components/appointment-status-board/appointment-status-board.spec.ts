import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';

describe('AppointmentStatusBoardComponent', () => {
  let comp: AppointmentStatusBoardComponent;

  beforeEach(() => {
    comp = new AppointmentStatusBoardComponent();
  });

  it('should initialize with empty cardsFor for any status', () => {
    expect(comp.cardsFor('scheduled')).toEqual([]);
    expect(comp.cardsFor('completed')).toEqual([]);
    expect(comp.cardsFor('cancelled')).toEqual([]);
  });

  it('should categorize appointments by status when filteredAppointments is set', () => {
    const mockAppts: Appointment[] = [
      { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date() },
      { id: '2', patientName: 'Bob', status: 'completed', datetime: new Date() },
      { id: '3', patientName: 'Charlie', status: 'scheduled', datetime: new Date() },
      { id: '4', patientName: 'Dave', status: 'cancelled', datetime: new Date() },
    ];

    comp.filteredAppointments = mockAppts;

    expect(comp.cardsFor('scheduled')).toHaveLength(2);
    expect(comp.cardsFor('scheduled').map(a => a.patientName)).toEqual(['Alice', 'Charlie']);

    expect(comp.cardsFor('completed')).toHaveLength(1);
    expect(comp.cardsFor('completed')[0].patientName).toBe('Bob');

    expect(comp.cardsFor('cancelled')).toHaveLength(1);
    expect(comp.cardsFor('cancelled')[0].patientName).toBe('Dave');
  });

  it('should update cardsFor when filteredAppointments changes', () => {
    comp.filteredAppointments = [
      { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date() }
    ];
    expect(comp.cardsFor('scheduled')).toHaveLength(1);

    comp.filteredAppointments = [
      { id: '1', patientName: 'Alice', status: 'completed', datetime: new Date() },
      { id: '2', patientName: 'Eve', status: 'completed', datetime: new Date() }
    ];
    expect(comp.cardsFor('scheduled')).toHaveLength(0);
    expect(comp.cardsFor('completed')).toHaveLength(2);
  });

  it('should handle null or empty input gracefully', () => {
    comp.filteredAppointments = null as any;
    expect(comp.cardsFor('scheduled')).toEqual([]);
  });
});
