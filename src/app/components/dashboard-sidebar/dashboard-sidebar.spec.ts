import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardSidebarComponent } from './dashboard-sidebar';

describe('DashboardSidebarComponent', () => {
  let component: DashboardSidebarComponent;

  beforeEach(() => {
    component = new DashboardSidebarComponent();
  });

  it('should create component instance', () => {
    expect(component).toBeTruthy();
  });

  it('should identify today correctly', () => {
    const today = new Date();
    expect(component.isToday(today)).toBe(true);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(component.isToday(yesterday)).toBe(false);
  });

  it('should identify selected calendar date correctly', () => {
    const targetDate = new Date(2026, 9, 6);
    component.selectedCalDate = targetDate;
    expect(component.isCalSelected(targetDate)).toBe(true);

    const otherDate = new Date(2026, 9, 7);
    expect(component.isCalSelected(otherDate)).toBe(false);
  });

  it('should filter appointments on a specific date', () => {
    const dateStr = '2026-10-06T10:00:00';
    const appt: any = { id: 'a1', datetime: dateStr };
    component.appointments = [appt];

    const matchingDate = new Date(2026, 9, 6);
    expect(component.appointmentsOnDate(matchingDate)).toEqual([appt]);

    const nonMatchingDate = new Date(2026, 9, 7);
    expect(component.appointmentsOnDate(nonMatchingDate)).toEqual([]);
  });

  it('should emit outputs when calendar events are triggered', () => {
    const prevSpy = vi.spyOn(component.prevMonthClicked, 'emit');
    const nextSpy = vi.spyOn(component.nextMonthClicked, 'emit');
    const daySpy = vi.spyOn(component.calDayClicked, 'emit');
    const bookSpy = vi.spyOn(component.bookNewClicked, 'emit');
    const todaySpy = vi.spyOn(component.goTodayClicked, 'emit');

    component.prevMonthClicked.emit();
    expect(prevSpy).toHaveBeenCalledOnce();

    component.nextMonthClicked.emit();
    expect(nextSpy).toHaveBeenCalledOnce();

    const d = new Date(2026, 9, 6);
    component.calDayClicked.emit(d);
    expect(daySpy).toHaveBeenCalledWith(d);

    component.bookNewClicked.emit();
    expect(bookSpy).toHaveBeenCalledOnce();

    component.goTodayClicked.emit();
    expect(todaySpy).toHaveBeenCalledOnce();
  });
});
