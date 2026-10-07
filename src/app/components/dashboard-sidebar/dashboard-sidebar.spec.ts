import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardSidebarComponent } from './dashboard-sidebar';
import { Appointment } from '../../models/appointment.model';

describe('DashboardSidebarComponent', () => {
  let comp: DashboardSidebarComponent;

  beforeEach(() => {
    vi.clearAllMocks();
    comp = new DashboardSidebarComponent();
  });

  it('should instantiate component', () => {
    expect(comp).toBeTruthy();
    expect(comp.calMonthLabel).toBe('');
    expect(comp.calendarDays).toEqual([]);
    expect(comp.appointments).toEqual([]);
  });

  it('should identify today date accurately', () => {
    const today = new Date();
    const otherDate = new Date(2020, 0, 1);

    expect(comp.isToday(today)).toBe(true);
    expect(comp.isToday(otherDate)).toBe(false);
  });

  it('should identify selected calendar date accurately', () => {
    const selected = new Date(2025, 5, 15);
    comp.selectedCalDate = selected;

    expect(comp.isCalSelected(new Date(2025, 5, 15))).toBe(true);
    expect(comp.isCalSelected(new Date(2025, 5, 16))).toBe(false);
  });

  it('should filter appointments on specific date', () => {
    const date1 = new Date(2025, 2, 10, 10, 0);
    const date2 = new Date(2025, 2, 11, 14, 0);

    const appt1: Appointment = {
      id: 'a1',
      patientId: 'p1',
      patientName: 'Alice',
      datetime: date1,
      status: 'scheduled'
    };
    const appt2: Appointment = {
      id: 'a2',
      patientId: 'p2',
      patientName: 'Bob',
      datetime: date2,
      status: 'scheduled'
    };

    comp.appointments = [appt1, appt2];

    const result = comp.appointmentsOnDate(new Date(2025, 2, 10));
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('a1');
  });

  it('should emit event when prevMonthClicked, nextMonthClicked, or calDayClicked are triggered', () => {
    const prevSpy = vi.spyOn(comp.prevMonthClicked, 'emit');
    const nextSpy = vi.spyOn(comp.nextMonthClicked, 'emit');
    const daySpy = vi.spyOn(comp.calDayClicked, 'emit');

    comp.prevMonthClicked.emit();
    expect(prevSpy).toHaveBeenCalled();

    comp.nextMonthClicked.emit();
    expect(nextSpy).toHaveBeenCalled();

    const targetDay = new Date(2025, 3, 20);
    comp.calDayClicked.emit(targetDay);
    expect(daySpy).toHaveBeenCalledWith(targetDay);
  });
});
