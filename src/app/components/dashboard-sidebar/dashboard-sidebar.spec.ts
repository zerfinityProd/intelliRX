import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardSidebarComponent } from './dashboard-sidebar';
import { Appointment } from '../../models/appointment.model';

describe('DashboardSidebarComponent', () => {
  let component: DashboardSidebarComponent;

  beforeEach(() => {
    component = new DashboardSidebarComponent();
  });

  describe('Appointment Date Map Optimization', () => {
    it('returns 0 count and false for hasAppointments when no appointments exist', () => {
      component.appointments = [];
      component.ngOnInit();

      const testDate = new Date(2026, 4, 15); // May 15, 2026
      expect(component.getAppointmentCount(testDate)).toBe(0);
      expect(component.hasAppointments(testDate)).toBe(false);
      expect(component.appointmentsOnDate(testDate)).toEqual([]);
    });

    it('indexes appointments correctly by YYYY-M-D date key', () => {
      const appt1: Appointment = {
        id: '1',
        patientName: 'Alice',
        datetime: new Date(2026, 4, 15, 10, 0), // May 15, 2026, 10:00 AM
        status: 'scheduled'
      };
      const appt2: Appointment = {
        id: '2',
        patientName: 'Bob',
        datetime: new Date(2026, 4, 15, 14, 30), // May 15, 2026, 2:30 PM
        status: 'completed'
      };
      const appt3: Appointment = {
        id: '3',
        patientName: 'Charlie',
        datetime: new Date(2026, 4, 16, 11, 0), // May 16, 2026
        status: 'scheduled'
      };

      component.appointments = [appt1, appt2, appt3];
      component.ngOnInit();

      const may15 = new Date(2026, 4, 15);
      const may16 = new Date(2026, 4, 16);
      const may17 = new Date(2026, 4, 17);

      expect(component.getAppointmentCount(may15)).toBe(2);
      expect(component.hasAppointments(may15)).toBe(true);
      expect(component.appointmentsOnDate(may15)).toEqual([appt1, appt2]);

      expect(component.getAppointmentCount(may16)).toBe(1);
      expect(component.hasAppointments(may16)).toBe(true);
      expect(component.appointmentsOnDate(may16)).toEqual([appt3]);

      expect(component.getAppointmentCount(may17)).toBe(0);
      expect(component.hasAppointments(may17)).toBe(false);
      expect(component.appointmentsOnDate(may17)).toEqual([]);
    });

    it('rebuilds lookup map on ngOnChanges when appointments input changes', () => {
      component.appointments = [];
      component.ngOnInit();

      const testDate = new Date(2026, 8, 20); // Sept 20, 2026
      expect(component.hasAppointments(testDate)).toBe(false);

      const appt: Appointment = {
        id: '10',
        patientName: 'Diana',
        datetime: new Date(2026, 8, 20, 9, 0),
        status: 'scheduled'
      };

      component.appointments = [appt];
      component.ngOnChanges({
        appointments: {
          previousValue: [],
          currentValue: [appt],
          firstChange: false,
          isFirstChange: () => false
        }
      });

      expect(component.getAppointmentCount(testDate)).toBe(1);
      expect(component.hasAppointments(testDate)).toBe(true);
      expect(component.appointmentsOnDate(testDate)).toEqual([appt]);
    });
  });

  describe('Calendar Date Helpers', () => {
    it('identifies today correctly', () => {
      const today = new Date();
      const notToday = new Date(2000, 0, 1);

      expect(component.isToday(today)).toBe(true);
      expect(component.isToday(notToday)).toBe(false);
    });

    it('identifies selected calendar date correctly', () => {
      component.selectedCalDate = new Date(2026, 5, 10);

      const sameDate = new Date(2026, 5, 10);
      const differentDate = new Date(2026, 5, 11);

      expect(component.isCalSelected(sameDate)).toBe(true);
      expect(component.isCalSelected(differentDate)).toBe(false);
    });
  });
});
