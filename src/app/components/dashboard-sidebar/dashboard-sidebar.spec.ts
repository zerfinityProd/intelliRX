import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { DashboardSidebarComponent } from './dashboard-sidebar';
import { Appointment } from '../../models/appointment.model';

describe('DashboardSidebarComponent Optimization', () => {
  it('should pre-index appointments by date key and return O(1) lookups', () => {
    const comp = new DashboardSidebarComponent();
    const appts: Appointment[] = [
      { id: '1', datetime: new Date('2026-09-29T10:00:00'), status: 'scheduled' },
      { id: '2', datetime: new Date('2026-09-29T14:30:00'), status: 'completed' },
      { id: '3', datetime: new Date('2026-09-30T09:00:00'), status: 'scheduled' },
    ];

    comp.appointments = appts;

    const sep29 = new Date('2026-09-29T00:00:00');
    const sep30 = new Date('2026-09-30T00:00:00');
    const oct01 = new Date('2026-10-01T00:00:00');

    expect(comp.appointmentsOnDate(sep29).length).toBe(2);
    expect(comp.appointmentsOnDate(sep30).length).toBe(1);
    expect(comp.appointmentsOnDate(oct01).length).toBe(0);

    // Verify referential stability (returns the same pre-computed array instance)
    const res1 = comp.appointmentsOnDate(sep29);
    const res2 = comp.appointmentsOnDate(sep29);
    expect(res1).toBe(res2);
  });
});
