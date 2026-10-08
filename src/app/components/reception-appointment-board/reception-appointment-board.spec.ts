import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ReceptionAppointmentBoardComponent } from './reception-appointment-board';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

describe('ReceptionAppointmentBoardComponent', () => {
  let comp: ReceptionAppointmentBoardComponent;

  const mockColumns: BoardColumn[] = [
    { id: 'scheduled', label: 'Scheduled', color: '#E7F5F7', accent: '#148D9E', icon: 'clock' },
    { id: 'completed', label: 'Completed', color: '#E7F5F7', accent: '#1CB5C9', icon: 'check' },
    { id: 'cancelled', label: 'Cancelled', color: '#fee2e2', accent: '#ef4444', icon: 'x' },
  ];

  const mockAppointments: Appointment[] = [
    { id: '101', patientName: 'Eve', status: 'scheduled', datetime: new Date('2026-04-20T09:00:00') },
    { id: '102', patientName: 'Frank', status: 'completed', datetime: new Date('2026-04-20T09:30:00') },
  ];

  beforeEach(() => {
    comp = new ReceptionAppointmentBoardComponent();
    comp.columns = mockColumns;
    comp.filteredAppointments = mockAppointments;
  });

  it('pre-indexes appointments by status on ngOnChanges', () => {
    comp.ngOnChanges({
      filteredAppointments: { currentValue: mockAppointments, previousValue: [], firstChange: true, isFirstChange: () => true },
      columns: { currentValue: mockColumns, previousValue: [], firstChange: true, isFirstChange: () => true },
    });

    expect(comp.cardsFor('scheduled').length).toBe(1);
    expect(comp.cardsFor('scheduled')[0].patientName).toBe('Eve');
    expect(comp.cardsFor('completed').length).toBe(1);
    expect(comp.cardsFor('completed')[0].patientName).toBe('Frank');
    expect(comp.cardsFor('cancelled').length).toBe(0);
  });

  it('handles empty filteredAppointments gracefully', () => {
    comp.filteredAppointments = [];
    comp.ngOnChanges({
      filteredAppointments: { currentValue: [], previousValue: mockAppointments, firstChange: false, isFirstChange: () => false },
    });

    expect(comp.cardsFor('scheduled')).toEqual([]);
    expect(comp.cardsFor('completed')).toEqual([]);
    expect(comp.cardsFor('cancelled')).toEqual([]);
  });
});
