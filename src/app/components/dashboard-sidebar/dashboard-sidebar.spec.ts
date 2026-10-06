import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardSidebarComponent } from './dashboard-sidebar';
import { Appointment } from '../../models/appointment.model';

function makeAppointment(id: string, datetime: Date): Appointment {
  return {
    id,
    patientId: 'patient-1',
    patientName: 'John Doe',
    datetime: datetime.toISOString(),
    status: 'scheduled',
    created_at: new Date().toISOString()
  };
}

describe('DashboardSidebarComponent', () => {
  let component: DashboardSidebarComponent;

  beforeEach(() => {
    component = new DashboardSidebarComponent();
  });

  describe('Appointment Date Indexing', () => {
    it('correctly indexes appointments by date key and retrieves count and list in O(1)', () => {
      const targetDate = new Date(2026, 3, 15, 10, 30); // Apr 15, 2026
      const otherDate = new Date(2026, 3, 16, 14, 0);  // Apr 16, 2026

      const appt1 = makeAppointment('1', targetDate);
      const appt2 = makeAppointment('2', targetDate);
      const appt3 = makeAppointment('3', otherDate);

      component.appointments = [appt1, appt2, appt3];
      component.ngOnInit();

      expect(component.getAppointmentCount(targetDate)).toBe(2);
      expect(component.getAppointmentCount(otherDate)).toBe(1);

      const apr15Appts = component.appointmentsOnDate(targetDate);
      expect(apr15Appts.length).toBe(2);
      expect(apr15Appts.map(a => a.id)).toEqual(['1', '2']);
    });

    it('returns 0 and empty array for dates with no appointments', () => {
      component.appointments = [makeAppointment('1', new Date(2026, 3, 15))];
      component.ngOnInit();

      const emptyDate = new Date(2026, 3, 20);
      expect(component.getAppointmentCount(emptyDate)).toBe(0);
      expect(component.appointmentsOnDate(emptyDate)).toEqual([]);
    });

    it('rebuilds map when ngOnChanges fires for appointments', () => {
      const date = new Date(2026, 3, 15);
      component.appointments = [makeAppointment('1', date)];
      component.ngOnInit();

      expect(component.getAppointmentCount(date)).toBe(1);

      // Simulate input update
      const appt1 = makeAppointment('1', date);
      const appt2 = makeAppointment('2', date);
      component.appointments = [appt1, appt2];
      component.ngOnChanges({
        appointments: {
          previousValue: [appt1],
          currentValue: [appt1, appt2],
          firstChange: false,
          isFirstChange: () => false
        }
      });

      expect(component.getAppointmentCount(date)).toBe(2);
    });
  });

  describe('Calendar Date Helpers', () => {
    it('identifies today correctly', () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      expect(component.isToday(today)).toBe(true);
      expect(component.isToday(yesterday)).toBe(false);
    });

    it('identifies selected date correctly', () => {
      const selected = new Date(2026, 3, 15);
      const nonSelected = new Date(2026, 3, 16);

      component.selectedCalDate = selected;

      expect(component.isCalSelected(selected)).toBe(true);
      expect(component.isCalSelected(nonSelected)).toBe(false);
    });
  });
});
