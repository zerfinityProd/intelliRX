import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardSidebarComponent } from './dashboard-sidebar';
import { Appointment } from '../../models/appointment.model';

describe('DashboardSidebarComponent Optimization', () => {
  let comp: DashboardSidebarComponent;

  beforeEach(() => {
    comp = new DashboardSidebarComponent();
  });

  it('pre-indexes appointments by date key and retrieves them in O(1)', () => {
    const appt1: Appointment = {
      id: 'appt-1',
      patientName: 'Alice',
      datetime: new Date(2026, 3, 19, 10, 0), // 19 Apr 2026
      status: 'scheduled'
    };
    const appt2: Appointment = {
      id: 'appt-2',
      patientName: 'Bob',
      datetime: new Date(2026, 3, 19, 11, 30), // 19 Apr 2026
      status: 'completed'
    };
    const appt3: Appointment = {
      id: 'appt-3',
      patientName: 'Charlie',
      datetime: new Date(2026, 3, 20, 14, 0), // 20 Apr 2026
      status: 'scheduled'
    };

    comp.appointments = [appt1, appt2, appt3];

    const Apr19 = new Date(2026, 3, 19);
    const Apr20 = new Date(2026, 3, 20);
    const Apr21 = new Date(2026, 3, 21);

    expect(comp.appointmentsOnDate(Apr19)).toEqual([appt1, appt2]);
    expect(comp.appointmentsOnDate(Apr20)).toEqual([appt3]);
    expect(comp.appointmentsOnDate(Apr21)).toEqual([]);
  });

  it('handles empty appointment list and null/invalid dates', () => {
    comp.appointments = [
      { id: 'bad-1', datetime: 'invalid-date' as any },
      { id: 'bad-2', datetime: undefined as any }
    ];

    const today = new Date();
    expect(comp.appointmentsOnDate(today)).toEqual([]);
  });

  it('updates pre-indexed map when appointments property is updated', () => {
    comp.appointments = [
      { id: '1', datetime: new Date(2026, 3, 19) }
    ];
    expect(comp.appointmentsOnDate(new Date(2026, 3, 19)).length).toBe(1);

    comp.appointments = [
      { id: '1', datetime: new Date(2026, 3, 19) },
      { id: '2', datetime: new Date(2026, 3, 19) }
    ];
    expect(comp.appointmentsOnDate(new Date(2026, 3, 19)).length).toBe(2);
  });
});
