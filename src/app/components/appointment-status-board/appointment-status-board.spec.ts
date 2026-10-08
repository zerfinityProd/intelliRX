import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppointmentStatusBoardComponent } from './appointment-status-board';
import { Appointment } from '../../models/appointment.model';
import { BoardColumn } from '../../interfaces/board-column';

describe('AppointmentStatusBoardComponent', () => {
  let comp: AppointmentStatusBoardComponent;

  const mockColumns: BoardColumn[] = [
    { id: 'scheduled', label: 'Scheduled', color: '#E7F5F7', accent: '#148D9E', icon: 'clock' },
    { id: 'completed', label: 'Completed', color: '#E7F5F7', accent: '#1CB5C9', icon: 'check' },
    { id: 'cancelled', label: 'Cancelled', color: '#fee2e2', accent: '#ef4444', icon: 'x' },
  ];

  const mockAppointments: Appointment[] = [
    { id: '1', patientName: 'Alice', status: 'scheduled', datetime: new Date('2026-04-20T10:00:00') },
    { id: '2', patientName: 'Bob', status: 'scheduled', datetime: new Date('2026-04-20T11:00:00') },
    { id: '3', patientName: 'Charlie', status: 'completed', datetime: new Date('2026-04-20T12:00:00') },
    { id: '4', patientName: 'Dave', status: 'cancelled', datetime: new Date('2026-04-20T13:00:00') },
  ];

  beforeEach(() => {
    comp = new AppointmentStatusBoardComponent();
    comp.columns = mockColumns;
    comp.filteredAppointments = mockAppointments;
  });

  it('returns empty array when ngOnChanges has not run yet', () => {
    expect(comp.cardsFor('scheduled')).toEqual([]);
  });

  it('pre-indexes appointments by status on ngOnChanges', () => {
    comp.ngOnChanges({
      filteredAppointments: { currentValue: mockAppointments, previousValue: [], firstChange: true, isFirstChange: () => true },
      columns: { currentValue: mockColumns, previousValue: [], firstChange: true, isFirstChange: () => true },
    });

    const scheduled = comp.cardsFor('scheduled');
    const completed = comp.cardsFor('completed');
    const cancelled = comp.cardsFor('cancelled');

    expect(scheduled.length).toBe(2);
    expect(scheduled.map(a => a.patientName)).toEqual(['Alice', 'Bob']);
    expect(completed.length).toBe(1);
    expect(completed[0].patientName).toBe('Charlie');
    expect(cancelled.length).toBe(1);
    expect(cancelled[0].patientName).toBe('Dave');
  });

  it('updates pre-indexed map when filteredAppointments changes', () => {
    comp.ngOnChanges({
      filteredAppointments: { currentValue: mockAppointments, previousValue: [], firstChange: true, isFirstChange: () => true },
    });

    expect(comp.cardsFor('scheduled').length).toBe(2);

    // Update appointments
    const updatedAppointments: Appointment[] = [
      { id: '1', patientName: 'Alice', status: 'completed', datetime: new Date('2026-04-20T10:00:00') },
    ];
    comp.filteredAppointments = updatedAppointments;
    comp.ngOnChanges({
      filteredAppointments: { currentValue: updatedAppointments, previousValue: mockAppointments, firstChange: false, isFirstChange: () => false },
    });

    expect(comp.cardsFor('scheduled').length).toBe(0);
    expect(comp.cardsFor('completed').length).toBe(1);
    expect(comp.cardsFor('completed')[0].patientName).toBe('Alice');
  });

  it('returns empty array for unknown status without error', () => {
    comp.ngOnChanges({
      filteredAppointments: { currentValue: mockAppointments, previousValue: [], firstChange: true, isFirstChange: () => true },
    });
    expect(comp.cardsFor('no_show' as any)).toEqual([]);
  });
});
